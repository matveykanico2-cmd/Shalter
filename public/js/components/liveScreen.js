import { el, mount, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";
import { subscribeLive, joinLive, leaveLive, stopLive, toggleMic, toggleCam, toggleScreenShare } from "../lib/liveController.js";
import { VolumeControl } from "./volumeControl.js";
import { applyVolumeToAll } from "../lib/mediaVolume.js";
import { attachFlv, isFlvSupported } from "../lib/flvPlayer.js";

// Экран эфира. Слева — видео и управление, справа — участники и чат.
//
// Разделение обязанностей: медиа целиком в lib/liveController.js, здесь только
// показ и нажатия. Поэтому на любое изменение состава экран перерисовывается
// целиком — кроме <video>, которые переиспользуются: пересоздание элемента
// сбрасывает воспроизведение, и картинка моргала бы на каждый вход зрителя.
const videoNodes = new Map();

// Поле «скопируй это в OBS». Только для чтения и с кнопкой копирования:
// ключ потока — 32 знака вперемешку, и набирать его руками никто не станет,
// а выделять мышью в модальном окне неудобно.
function obsField(label, value) {
  const input = el("input", { class: "live-obs-input", type: "text", value: value ?? "", readonly: true });
  const button = el(
    "button",
    {
      class: "live-obs-copy",
      type: "button",
      onclick: async () => {
        input.select();
        try {
          await navigator.clipboard.writeText(value ?? "");
          button.textContent = "Скопировано";
        } catch {
          // Буфер обмена недоступен (нет https или отказано) — текст уже
          // выделен, и остаётся обычное Ctrl+C.
          button.textContent = "Выделено — Ctrl+C";
        }
        setTimeout(() => (button.textContent = "Копировать"), 2000);
      },
    },
    "Копировать"
  );
  return el("label", { class: "live-obs-field" }, [el("span", { class: "live-obs-label" }, label), input, button]);
}

function videoFor(key, stream, { muted = false, mirrored = false } = {}) {
  let node = videoNodes.get(key);
  if (!node) {
    node = el("video", { class: "live-video", autoplay: true, playsinline: true });
    videoNodes.set(key, node);
  }
  node.muted = muted;
  node.classList.toggle("mirrored", mirrored);
  if (stream && node.srcObject !== stream) node.srcObject = stream;
  return node;
}

export function openLiveScreen(streamId, { chatTitle, canStopStream = false } = {}) {
  const overlay = el("div", { class: "live-overlay" });
  const body = el("div", { class: "live-body" });
  overlay.appendChild(body);
  document.body.appendChild(overlay);

  let unsub = null;
  let sending = false;
  let error = null;
  // Один узел на всё время эфира — по той же причине, что и <video> выше:
  // экран пересобирается на каждое сообщение в чат, а ползунок, пересозданный
  // во время перетаскивания, бросает его на полпути.
  const volumeControl = VolumeControl();

  // Развернуть эфир на весь экран — двойным нажатием по картинке, как в
  // звонке. И на телефоне, и на компьютере.
  function toggleFullscreen(node) {
    const target = node?.closest(".live-overlay, .live-main") ?? node;
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else target.requestFullscreen?.().catch(() => {});
  }

  // Плитку участника можно отодвинуть пальцем — она же накрывает картинку
  // ведущего, и под ней может оказаться то, что нужно разглядеть.
  function startTileDrag(e) {
    const node = e.currentTarget;
    const rect = node.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    node.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      node.style.position = "fixed";
      node.style.left = `${Math.min(Math.max(4, ev.clientX - dx), window.innerWidth - rect.width - 4)}px`;
      node.style.top = `${Math.min(Math.max(4, ev.clientY - dy), window.innerHeight - rect.height - 4)}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
    };
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
  }
  // Эфир из OBS: своё <video>, переживающее перерисовки (иначе поток
  // переподключался бы на каждое сообщение в чате), и статус подключения.
  let flvNode = null;
  let flvDetach = null;
  let flvStatus = null;

  function flvVideo(url) {
    if (!flvNode) {
      flvNode = el("video", { class: "live-video", autoplay: true, playsinline: true, controls: false });
      flvDetach = attachFlv(flvNode, url, {
        onStatus: (state, text) => {
          const next = state === "playing" ? null : text;
          if (next === flvStatus) return;
          flvStatus = next;
          render(lastState);
        },
      });
    }
    return flvNode;
  }
  const chatInput = el("input", { class: "live-chat-input", placeholder: "Сообщение в эфир", maxlength: 500 });

  function close() {
    unsub?.();
    flvDetach?.();
    flvDetach = null;
    flvNode = null;
    videoNodes.clear();
    overlay.remove();
  }

  async function send() {
    const text = chatInput.value.trim();
    if (!text || sending) return;
    sending = true;
    chatInput.value = "";
    try {
      await api.sendLiveMessage(streamId, text);
    } catch (err) {
      error = err.message || "Не удалось отправить";
    }
    sending = false;
  }
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  async function act(fn) {
    try {
      await fn();
    } catch (err) {
      error = err.message || "Не получилось";
      render(lastState);
    }
  }

  let lastState = null;

  function render(s) {
    lastState = s;
    clear(body);
    if (!s) {
      // Без состояния экран не знает, эфир кончился или войти не вышло, —
      // поэтому текст берётся из ошибки, если она есть. Иначе «Эфир завершён»
      // говорилось и про живой эфир, в который просто не пустили.
      appendAll(body, 
        el("div", { class: "live-message" }, [
          el("p", {}, error || "Эфир завершён"),
          el("button", { class: "btn-accent", onclick: close }, "Закрыть"),
        ])
      );
      return;
    }
    if (s.stream.status === "ended") {
      appendAll(body, el("div", { class: "live-message" }, [el("p", {}, "Эфир завершён"), el("button", { class: "btn-accent", onclick: close }, "Закрыть")]));
      return;
    }

    const isHost = s.myRole === "host";
    // Эфир из OBS: картинка приходит потоком с сервера, соединений с ведущим
    // нет вообще. Всё остальное на экране — чат, участники, громкость —
    // работает ровно так же. А вот микрофон, камера и «дать слово» здесь
    // бессмысленны: браузер в таком эфире ничего не отправляет, и кнопки
    // обещали бы то, чего не произойдёт.
    const viaObs = s.stream.source === "rtmp";
    // Завершить может ведущий или администратор чата (server/routes/live.js):
    // эфир принадлежит чату, и брошенный эфир должен быть кому выключить.
    const canStop = isHost || !!canStopStream;
    const canSpeak = !viaObs && (s.myRole === "host" || s.myRole === "speaker");
    const host = s.participants.find((p) => p.role === "host");
    const speakers = s.participants.filter((p) => p.role === "speaker");
    const viewers = s.participants.filter((p) => p.role === "viewer");
    const mine = s.participants.find((p) => p.userId === s.me.id);

    // Главная картинка — ведущего: своя, если ведущий я, иначе принятая.
    const hostStream = host?.userId === s.me.id ? s.localStream : host ? s.remoteStreams[host.userId] : null;

    const obsUnsupported = viaObs && !isFlvSupported();
    const obsStage = obsUnsupported
      ? el("div", { class: "live-stage-empty" }, [
          el("p", {}, "Этот эфир идёт из внешней программы, а браузер не умеет его показывать."),
          el("p", { class: "live-obs-hint" }, "Откройте его в Chrome, Firefox или Edge — в Safari на iPhone такой поток не проигрывается."),
        ])
      : !s.stream.rtmpLive
        ? el("div", { class: "live-stage-empty" }, [
            Avatar({ name: host?.user?.name ?? "?", color: host?.user?.avatarColor, image: host?.user?.avatarImage, size: 96 }),
            el("p", {}, isHost ? "Запустите трансляцию в OBS" : "Ведущий ещё не начал вещание"),
          ])
        : flvVideo(s.flvUrl);

    const stage = el("div", { class: "live-stage", ondblclick: (e) => { e.preventDefault(); toggleFullscreen(e.currentTarget); } }, [
      viaObs
        ? obsStage
        : // Картинка ведущего показывается, если эфир вообще с видео — или если в
      // потоке уже есть видеодорожка. Второе — про демонстрацию экрана в
      // голосовом эфире: withVideo там false, но показывать зрителям экран как
      // раз надо, и без этой половины условия они видели бы заглушку
      // «Голосовой эфир» поверх идущего показа.
      hostStream && (s.stream.withVideo || !!hostStream.getVideoTracks?.().length)
        ? videoFor("main", hostStream, {
            muted: host?.userId === s.me.id,
            // Зеркалить экран нельзя: зеркало нужно камере, чтобы человек
            // видел себя как в зеркале, а показанный задом наперёд текст —
            // это просто нечитаемый текст.
            mirrored: host?.userId === s.me.id && !s.sharing,
          })
        : el("div", { class: "live-stage-empty" }, [
            Avatar({ name: host?.user?.name ?? "?", color: host?.user?.avatarColor, image: host?.user?.avatarImage, size: 96 }),
            el("p", {}, s.stream.withVideo ? "Ведущий ещё не включил камеру" : "Голосовой эфир"),
          ]),
      el("div", { class: "live-stage-top" }, [
        el("span", { class: "live-badge" }, "В ЭФИРЕ"),
        el("span", { class: "live-title" }, s.stream.title || chatTitle || "Эфир"),
        el("span", { class: "live-count" }, `${s.participants.length} в эфире`),
      ]),
      // Плитки тех, кому дали слово, — поверх картинки ведущего, как в любой
      // трансляции с гостями.
      speakers.length
        ? el(
            "div",
            { class: "live-speakers" },
            speakers.map((p) => {
              const stream = p.userId === s.me.id ? s.localStream : s.remoteStreams[p.userId];
              // Есть картинка — плитка становится настоящим видео-окном, а не
              // строчкой с именем: в совместном эфире собеседников должно быть
              // видно, а не подписано.
              const hasVideo = !!stream?.getVideoTracks?.().some((t) => t.readyState === "live" && t.enabled);
              return el("div", {
                class: `live-speaker ${hasVideo ? "with-video" : ""} ${p.mutedByHost ? "muted" : ""}`,
                onpointerdown: hasVideo ? startTileDrag : undefined,
                ondblclick: (e) => { e.preventDefault(); toggleFullscreen(e.currentTarget); },
                title: hasVideo ? "Перетащите, чтобы отодвинуть · двойное нажатие — на весь экран" : undefined,
              }, [
                stream ? videoFor(`sp_${p.userId}`, stream, { muted: p.userId === s.me.id }) : null,
                hasVideo ? null : Avatar({ name: p.user.name, color: p.user.avatarColor, image: p.user.avatarImage, size: 34 }),
                el("span", { class: "live-speaker-name" }, p.user.name),
                p.mutedByHost ? el("span", { class: "live-speaker-mute", html: iconSvg("BellOff", 12) }) : null,
              ]);
            })
          )
        : null,
    ]);

    const controls = el("div", { class: "live-controls" }, [
      canSpeak
        ? el("button", { class: `live-ctl ${s.micOn && !mine?.mutedByHost ? "on" : "off"}`, onclick: toggleMic, title: "Микрофон" }, [
            el("span", { html: iconSvg("Mic", 18) }),
            el("span", {}, mine?.mutedByHost ? "Заглушены" : s.micOn ? "Микрофон" : "Включить"),
          ])
        : null,
      // Кнопка камеры — у всех, кто вещает: ведущий и получившие слово. Для
      // совместного эфира это и есть главное: включить себя в кадр.
      canSpeak && !viaObs && s.stream.withVideo
        ? el("button", { class: `live-ctl ${s.camOn ? "on" : "off"}`, onclick: toggleCam, title: "Камера" }, [
            el("span", { html: iconSvg("Video", 18) }),
            el("span", {}, s.camOn ? "Камера" : "Включить"),
          ])
        : null,
      // Показывать экран может любой, кто вещает, — ведущий и получившие слово.
      // У зрителя исходящего потока нет вовсе, и кнопка ему ничего бы не дала.
      s.canShare
        ? el(
            "button",
            {
              class: `live-ctl ${s.sharing ? "on" : ""}`,
              onclick: () => act(() => toggleScreenShare()),
              title: s.sharing ? "Остановить показ экрана" : "Показать свой экран",
            },
            [el("span", { html: iconSvg("Monitor", 18) }), el("span", {}, s.sharing ? "Показ идёт" : "Экран")]
          )
        : null,
      // Единственное, что зритель решает сам: попроситься говорить.
      !canSpeak && !viaObs
        ? el(
            "button",
            {
              class: `live-ctl ${mine?.handRaised ? "on" : ""}`,
              onclick: () => act(() => api.raiseLiveHand(streamId, !mine?.handRaised)),
            },
            [el("span", {}, "✋"), el("span", {}, mine?.handRaised ? "Рука поднята" : "Попросить слово")]
          )
        : null,
      // Ведущему выходить некуда — его уход и есть конец эфира (сервер так и
      // делает), поэтому у него одна красная кнопка. Администратор чата, зашедший
      // зрителем, получает обе: выйти самому и выключить брошенный эфир.
      !isHost
        ? el("button", { class: "live-ctl", onclick: () => act(async () => { await leaveLive(); close(); }) }, [
            el("span", { html: iconSvg("LogOut", 18) }),
            el("span", {}, "Выйти"),
          ])
        : null,
      canStop
        ? el("button", { class: "live-ctl danger", onclick: () => act(async () => { await stopLive(); close(); }) }, [
            el("span", { html: iconSvg("X", 18) }),
            el("span", {}, "Завершить эфир"),
          ])
        : null,
      volumeControl,
    ]);

    // Участники: у ведущего рядом с каждым — то, что он может сделать. Поднятая
    // рука поднимает человека наверх списка: иначе просьбу о слове приходится
    // искать глазами среди всех.
    const rows = [...(host ? [host] : []), ...speakers, ...viewers.slice().sort((a, b) => Number(b.handRaised) - Number(a.handRaised))];
    const people = el("div", { class: "live-people" }, [
      el("p", { class: "live-panel-title" }, `Участники — ${s.participants.length}`),
      ...rows.map((p) =>
        el("div", { class: "live-person" }, [
          Avatar({ name: p.user.name, color: p.user.avatarColor, image: p.user.avatarImage, size: 28 }),
          el("div", { class: "live-person-body" }, [
            el("p", { class: "live-person-name" }, [p.user.name, p.handRaised ? el("span", { class: "live-hand" }, "✋") : null]),
            el("p", { class: "live-person-role" }, p.role === "host" ? "ведущий" : p.role === "speaker" ? "говорит" : "смотрит"),
          ]),
          isHost && !viaObs && p.role !== "host"
            ? el("div", { class: "live-person-actions" }, [
                p.role === "speaker"
                  ? el("button", {
                      class: "live-mini-btn",
                      title: p.mutedByHost ? "Разрешить звук" : "Заглушить",
                      onclick: () => act(() => api.setLiveMuted(streamId, p.userId, !p.mutedByHost)),
                    }, p.mutedByHost ? "🔇" : "🔈")
                  : null,
                el("button", {
                  class: `live-mini-btn ${p.role === "speaker" ? "danger" : "accent"}`,
                  onclick: () => act(() => api.setLiveRole(streamId, p.userId, p.role === "speaker" ? "viewer" : "speaker")),
                }, p.role === "speaker" ? "Забрать слово" : "Дать слово"),
              ])
            : null,
        ])
      ),
    ]);

    const chat = el("div", { class: "live-chat" }, [
      el("p", { class: "live-panel-title" }, "Чат эфира"),
      el(
        "div",
        { class: "live-chat-list" },
        s.messages.length
          ? s.messages.map((m) =>
              el("p", { class: "live-chat-msg" }, [el("span", { class: "live-chat-author" }, `${m.user.name}: `), m.text])
            )
          : [el("p", { class: "live-chat-empty" }, "Пока никто ничего не написал")]
      ),
      el("div", { class: "live-chat-form" }, [chatInput, el("button", { class: "live-send-btn", html: iconSvg("Send", 16), onclick: send })]),
    ]);

    // Что вставить в OBS. Показывается только ведущему и только пока программа
    // не подключилась: как только картинка пошла, эти поля занимают место зря.
    const obsPanel =
      viaObs && isHost && s.ingest && !s.stream.rtmpLive
        ? el("div", { class: "live-obs-panel" }, [
            el("p", { class: "live-obs-title" }, "Настройки для OBS Studio"),
            el("p", { class: "live-obs-sub" }, "Настройки → Вещание → Сервис: «Настраиваемый…»"),
            obsField("Сервер", s.ingest.url),
            obsField("Ключ потока", s.ingest.key),
            el("p", { class: "live-obs-hint" }, "Дальше — «Запустить трансляцию» в OBS. Картинка появится здесь через пару секунд."),
          ])
        : null;

    appendAll(body, 
      el("div", { class: "live-main" }, [
        stage,
        obsPanel,
        flvStatus ? el("p", { class: "live-error" }, flvStatus) : null,
        error ? el("p", { class: "live-error" }, error) : null,
        s.error ? el("p", { class: "live-error" }, s.error) : null,
        controls,
      ]),
      el("div", { class: "live-side" }, [people, chat])
    );
    // Прокрутка чата к последнему сообщению — иначе новое приходит за границу
    // видимой части и эфир выглядит молчаливым.
    const list = chat.querySelector(".live-chat-list");
    if (list) list.scrollTop = list.scrollHeight;
    // Вошёл новый говорящий — появился новый <video> с громкостью браузера по
    // умолчанию; сохранённую громкость надо применить и к нему.
    applyVolumeToAll(overlay);
  }

  unsub = subscribeLive(render);
  joinLive(streamId).catch((err) => {
    error = err.message || "Не удалось войти в эфир";
    render(null);
    body.prepend(el("p", { class: "live-error" }, error));
  });

  return { close };
}

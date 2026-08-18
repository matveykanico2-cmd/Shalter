import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";
import { subscribeLive, joinLive, leaveLive, stopLive, toggleMic, toggleCam } from "../lib/liveController.js";

// Экран эфира. Слева — видео и управление, справа — участники и чат.
//
// Разделение обязанностей: медиа целиком в lib/liveController.js, здесь только
// показ и нажатия. Поэтому на любое изменение состава экран перерисовывается
// целиком — кроме <video>, которые переиспользуются: пересоздание элемента
// сбрасывает воспроизведение, и картинка моргала бы на каждый вход зрителя.
const videoNodes = new Map();

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

export function openLiveScreen(streamId, { chatTitle } = {}) {
  const overlay = el("div", { class: "live-overlay" });
  const body = el("div", { class: "live-body" });
  overlay.appendChild(body);
  document.body.appendChild(overlay);

  let unsub = null;
  let sending = false;
  let error = null;
  const chatInput = el("input", { class: "live-chat-input", placeholder: "Сообщение в эфир", maxlength: 500 });

  function close() {
    unsub?.();
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
      body.append(el("div", { class: "live-message" }, [el("p", {}, "Эфир завершён"), el("button", { class: "btn-accent", onclick: close }, "Закрыть")]));
      return;
    }
    if (s.stream.status === "ended") {
      body.append(el("div", { class: "live-message" }, [el("p", {}, "Эфир завершён"), el("button", { class: "btn-accent", onclick: close }, "Закрыть")]));
      return;
    }

    const isHost = s.myRole === "host";
    const canSpeak = s.myRole === "host" || s.myRole === "speaker";
    const host = s.participants.find((p) => p.role === "host");
    const speakers = s.participants.filter((p) => p.role === "speaker");
    const viewers = s.participants.filter((p) => p.role === "viewer");
    const mine = s.participants.find((p) => p.userId === s.me.id);

    // Главная картинка — ведущего: своя, если ведущий я, иначе принятая.
    const hostStream = host?.userId === s.me.id ? s.localStream : host ? s.remoteStreams[host.userId] : null;

    const stage = el("div", { class: "live-stage" }, [
      hostStream && s.stream.withVideo
        ? videoFor("main", hostStream, { muted: host?.userId === s.me.id, mirrored: host?.userId === s.me.id })
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
              return el("div", { class: `live-speaker ${p.mutedByHost ? "muted" : ""}` }, [
                stream ? videoFor(`sp_${p.userId}`, stream, { muted: p.userId === s.me.id }) : null,
                Avatar({ name: p.user.name, color: p.user.avatarColor, image: p.user.avatarImage, size: 34 }),
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
      isHost && s.stream.withVideo
        ? el("button", { class: `live-ctl ${s.camOn ? "on" : "off"}`, onclick: toggleCam, title: "Камера" }, [
            el("span", { html: iconSvg("Video", 18) }),
            el("span", {}, s.camOn ? "Камера" : "Включить"),
          ])
        : null,
      // Единственное, что зритель решает сам: попроситься говорить.
      !canSpeak
        ? el(
            "button",
            {
              class: `live-ctl ${mine?.handRaised ? "on" : ""}`,
              onclick: () => act(() => api.raiseLiveHand(streamId, !mine?.handRaised)),
            },
            [el("span", {}, "✋"), el("span", {}, mine?.handRaised ? "Рука поднята" : "Попросить слово")]
          )
        : null,
      isHost
        ? el("button", { class: "live-ctl danger", onclick: () => act(async () => { await stopLive(); close(); }) }, [
            el("span", { html: iconSvg("X", 18) }),
            el("span", {}, "Завершить эфир"),
          ])
        : el("button", { class: "live-ctl", onclick: () => act(async () => { await leaveLive(); close(); }) }, [
            el("span", { html: iconSvg("LogOut", 18) }),
            el("span", {}, "Выйти"),
          ]),
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
          isHost && p.role !== "host"
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

    body.append(
      el("div", { class: "live-main" }, [stage, error ? el("p", { class: "live-error" }, error) : null, s.error ? el("p", { class: "live-error" }, s.error) : null, controls]),
      el("div", { class: "live-side" }, [people, chat])
    );
    // Прокрутка чата к последнему сообщению — иначе новое приходит за границу
    // видимой части и эфир выглядит молчаливым.
    const list = chat.querySelector(".live-chat-list");
    if (list) list.scrollTop = list.scrollHeight;
  }

  unsub = subscribeLive(render);
  joinLive(streamId).catch((err) => {
    error = err.message || "Не удалось войти в эфир";
    render(null);
    body.prepend(el("p", { class: "live-error" }, error));
  });

  return { close };
}

import { askConfirm } from "./confirmDialog.js";
import { el, mount, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { Avatar } from "./avatar.js";
import { subscribeLive, joinLive, leaveLive, stopLive, toggleMic, toggleCam, toggleScreenShare } from "../lib/liveController.js";
import { VolumeControl } from "./volumeControl.js";
import { applyVolumeToAll } from "../lib/mediaVolume.js";
import { attachFlv, isFlvSupported } from "../lib/flvPlayer.js";
import { isServerModerator } from "../lib/moderation.js";

const videoNodes = new Map();

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
  let editingMessage = null;
  const volumeControl = VolumeControl();

  function toggleFullscreen(node) {
    const target = node?.closest(".live-overlay, .live-main") ?? node;
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else target.requestFullscreen?.().catch(() => {});
  }

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
    const editing = editingMessage;
    chatInput.value = "";
    try {
      if (editing) {
        await api.editLiveMessage(streamId, editing.id, text);
        stopEditing();
      } else {
        await api.sendLiveMessage(streamId, text);
      }
    } catch (err) {
      if (editing) chatInput.value = text;
      error = err.message || (editing ? "Не удалось сохранить" : "Не удалось отправить");
    }
    sending = false;
  }
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
    if (e.key === "Escape" && editingMessage) stopEditing();
  });

  function startEditing(m) {
    editingMessage = m;
    chatInput.value = m.text;
    chatInput.placeholder = "Изменить сообщение";
    chatInput.focus();
    lastState && render(lastState);
  }
  function stopEditing() {
    editingMessage = null;
    chatInput.value = "";
    chatInput.placeholder = "Сообщение в эфир";
    lastState && render(lastState);
  }
  async function removeMessage(m, meId) {
    if (!(await askConfirm(m.user?.id === meId ? "Удалить сообщение?" : `Удалить сообщение ${m.user?.name ?? "участника"}?`))) return;
    try {
      await api.deleteLiveMessage(streamId, m.id);
      if (editingMessage?.id === m.id) stopEditing();
    } catch (err) {
      error = err.message || "Не удалось удалить";
      lastState && render(lastState);
    }
  }

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
    const viaObs = s.stream.source === "rtmp";
    const canStop = isHost || !!canStopStream;
    const canSpeak = !viaObs && (s.myRole === "host" || s.myRole === "speaker");
    const host = s.participants.find((p) => p.role === "host");
    const speakers = s.participants.filter((p) => p.role === "speaker");
    const viewers = s.participants.filter((p) => p.role === "viewer");
    const mine = s.participants.find((p) => p.userId === s.me.id);

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
        :
      hostStream && (s.stream.withVideo || !!hostStream.getVideoTracks?.().length)
        ? videoFor("main", hostStream, {
            muted: host?.userId === s.me.id,
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
      speakers.length
        ? el(
            "div",
            { class: "live-speakers" },
            speakers.map((p) => {
              const stream = p.userId === s.me.id ? s.localStream : s.remoteStreams[p.userId];
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
      canSpeak && !viaObs && s.stream.withVideo
        ? el("button", { class: `live-ctl ${s.camOn ? "on" : "off"}`, onclick: toggleCam, title: "Камера" }, [
            el("span", { html: iconSvg("Video", 18) }),
            el("span", {}, s.camOn ? "Камера" : "Включить"),
          ])
        : null,
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
          ? s.messages.map((m) => {
              const own = m.user?.id === s.me?.id;
              const canDelete = own || isHost || canStopStream || isServerModerator();
              return el("div", { class: `live-chat-msg${editingMessage?.id === m.id ? " editing" : ""}` }, [
                el("p", {}, [
                  el("span", { class: "live-chat-author" }, `${m.user.name}: `),
                  m.text,
                  m.editedAt ? el("span", { class: "comment-edited" }, " · изм.") : null,
                ]),
                own || canDelete
                  ? el("div", { class: "comment-actions" }, [
                      own ? el("button", { class: "comment-action-btn", title: "Изменить", html: iconSvg("Edit", 13), onclick: () => startEditing(m) }) : null,
                      canDelete
                        ? el("button", { class: "comment-action-btn danger", title: "Удалить", html: iconSvg("Trash", 13), onclick: () => removeMessage(m, s.me?.id) })
                        : null,
                    ])
                  : null,
              ]);
            })
          : [el("p", { class: "live-chat-empty" }, "Пока никто ничего не написал")]
      ),
      editingMessage
        ? el("div", { class: "comment-editing-bar" }, [
            el("span", { html: iconSvg("Edit", 13) }),
            el("span", { class: "comment-editing-text" }, `Изменение: ${editingMessage.text}`),
            el("button", { class: "comment-action-btn", title: "Отменить", html: iconSvg("X", 14), onclick: stopEditing }),
          ])
        : null,
      el("div", { class: "live-chat-form" }, [chatInput, el("button", { class: "live-send-btn", html: iconSvg(editingMessage ? "Check" : "Send", 16), onclick: send })]),
    ]);

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
    const list = chat.querySelector(".live-chat-list");
    if (list) list.scrollTop = list.scrollHeight;
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

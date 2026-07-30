import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { navigate } from "../router.js";
import {
  subscribeCall,
  getCallState,
  joinCallById,
  toggleMute,
  toggleCamera,
  flipCamera,
  toggleScreenShare,
  hangup,
  minimize,
  addParticipant,
} from "../lib/callController.js";

function formatElapsed(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export async function CallScreenView(root, callId) {
  const me = getState().user;
  if (!getCallState() || getCallState().call.id !== callId) {
    await joinCallById(callId, me);
  }
  if (!getCallState()) {
    mount(root, el("div", { class: "empty-hint" }, "Звонок не найден или уже завершён."));
    return;
  }

  function render(s) {
    if (!s || s.call.id !== callId) return;
    // Minimizing always navigates away as a direct user/router action (the
    // minimize button below, or app.js's implicit-minimize-on-navigate-away) —
    // never react to it here, since that would re-enter navigate() from
    // inside the router's own dispatch and corrupt the in-flight navigation.
    if (s.minimized) return;
    if (s.phase === "ended") {
      mount(root, el("div", { class: "call-screen ended" }, [el("p", {}, "Звонок завершён")]));
      return;
    }

    const label = s.phase === "ringing" ? "Вызов…" : formatElapsed(s.elapsed);

    const tiles = s.others.length
      ? s.others.map((p) => {
          const remoteStream = s.remoteStreams[p.id] ?? null;
          const isConnected = !!s.connectedPeers[p.id];
          const showVideo = s.call.kind === "video" && remoteStream && remoteStream.getVideoTracks().length > 0;
          const tile = el("div", { class: "call-tile" }, [
            showVideo
              ? el("video", { autoplay: true, playsinline: true, class: "call-tile-video" })
              : el("div", { class: "call-tile-avatar-wrap" }, [
                  Avatar({ name: p.name, color: p.avatarColor, image: p.avatarImage, size: 72 }),
                  el("p", { class: "call-tile-name" }, p.name),
                  s.call.kind === "audio" ? el("audio", { autoplay: true }) : null,
                ]),
            el("p", { class: "call-tile-status" }, s.phase === "ringing" ? "вызов…" : isConnected ? "" : "соединение…"),
          ]);
          // el() only wires on*/props — srcObject needs a real assignment, not an attribute.
          const mediaEl = tile.querySelector("video, audio");
          if (mediaEl) mediaEl.srcObject = remoteStream;
          return tile;
        })
      : [el("p", { class: "call-empty-hint" }, "Ожидание участников…")];

    const localPip =
      s.call.kind === "video"
        ? el("div", { class: "call-local-pip" }, [
            s.cameraOn
              ? (() => {
                  const v = el("video", { autoplay: true, muted: true, playsinline: true, class: "call-local-video" });
                  v.srcObject = s.localStream;
                  return v;
                })()
              : el("div", { class: "call-local-avatar" }, [Avatar({ name: me.name, color: me.avatarColor, image: me.avatarImage, size: 48 })]),
            s.cameraOn
              ? el("button", { class: "call-flip-btn", html: iconSvg("FlipCamera", 14), onclick: flipCamera })
              : null,
          ])
        : null;

    const canAddParticipant = ["group"].includes(s.chatType);

    mount(
      root,
      el("div", { class: "call-screen" }, [
        el("div", { class: "call-header" }, [
          el("button", {
            class: "call-header-btn",
            html: iconSvg("ChevronLeft", 20),
            title: "Свернуть (PiP)",
            onclick: () => {
              minimize();
              navigate(`/chat/${s.call.chatId}`);
            },
          }),
          el("div", { class: "call-header-center" }, [
            el("p", { class: "call-header-title" }, s.chatTitle),
            el("p", { class: "call-header-timer mono" }, label),
          ]),
          el("div", { class: "call-header-spacer" }),
        ]),
        s.mediaError ? el("p", { class: "call-media-error" }, s.mediaError) : null,
        el("div", { class: "call-tiles-grid", style: { gridTemplateColumns: `repeat(${Math.min(s.others.length, 2) || 1}, minmax(0,1fr))` } }, tiles),
        localPip,
        el("div", { class: "call-controls" }, [
          el("button", {
            class: `call-control-btn ${s.muted ? "active" : ""}`,
            title: "Микрофон",
            html: iconSvg("Mic", 20),
            onclick: toggleMute,
          }),
          s.call.kind === "video"
            ? el("button", {
                class: `call-control-btn ${!s.cameraOn ? "active" : ""}`,
                title: "Камера",
                html: iconSvg("Video", 20),
                onclick: toggleCamera,
              })
            : null,
          el("button", {
            class: `call-control-btn ${s.sharing ? "accent" : ""}`,
            title: "Демонстрация экрана",
            html: iconSvg("Download", 20),
            onclick: toggleScreenShare,
          }),
          canAddParticipant
            ? el("button", {
                class: "call-control-btn",
                title: "Добавить участника",
                html: iconSvg("Plus", 20),
                onclick: (e) => openAddParticipantMenu(e, s),
              })
            : null,
          el("button", { class: "call-hangup-btn", title: "Завершить", html: iconSvg("Phone", 22, "rotate-135"), onclick: hangup }),
        ]),
      ])
    );
  }

  async function openAddParticipantMenu(e, s) {
    const { chat, members } = await api.getChat(s.call.chatId);
    const candidates = members.filter((m) => m.id !== me.id && !s.others.some((o) => o.id === m.id));
    if (!candidates.length) {
      openDropdownMenu({ x: e.clientX, y: e.clientY }, [{ label: "Все участники чата уже в звонке" }]);
      return;
    }
    openDropdownMenu(
      { x: e.clientX, y: e.clientY },
      candidates.map((c) => ({ label: c.name, onClick: () => addParticipant(c.id) }))
    );
  }

  render(getCallState());
  const unsub = subscribeCall(render);
  root._cleanup = () => unsub();
}

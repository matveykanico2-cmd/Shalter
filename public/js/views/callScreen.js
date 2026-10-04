import { askConfirm } from "../components/confirmDialog.js";
import { el, mount, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "../components/avatar.js";
import { openDropdownMenu } from "../components/dropdownMenu.js";
import { openContactPickerDialog } from "../components/contactPickerDialog.js";
import { VolumeControl } from "../components/volumeControl.js";
import { applyVolumeToAll } from "../lib/mediaVolume.js";
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
  createInviteLink,
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

  const remoteMediaEls = new Map();
  const volumeControl = VolumeControl();

  let swapped = false;
  let stageMode = false;
  let justDragged = false;
  function toggleFullscreen(node) {
    const target = node?.closest(".call-screen") ?? node;
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else target.requestFullscreen?.().catch(() => {});
  }

  const toggleSwap = () => {
    if (justDragged || stageMode) return;
    swapped = !swapped;
    render(getCallState());
  };

  function makeDraggable(key, selector) {
    let pos = null;
    let loaded = false;
    function read() {
      if (loaded) return pos;
      loaded = true;
      try {
        const raw = JSON.parse(localStorage.getItem(key) || "null");
        pos = raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : null;
      } catch {
        pos = null;
      }
      return pos;
    }
    function clamp(node, x, y) {
      const parent = node.offsetParent;
      const pw = parent?.clientWidth ?? window.innerWidth;
      const ph = parent?.clientHeight ?? window.innerHeight;
      return {
        x: Math.min(Math.max(8, x), Math.max(8, pw - node.offsetWidth - 8)),
        y: Math.min(Math.max(8, y), Math.max(8, ph - node.offsetHeight - 8)),
      };
    }
    function place(node, p) {
      node.style.left = `${p.x}px`;
      node.style.top = `${p.y}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
      node.style.transform = "none";
    }
    function apply(node) {
      const p = read();
      if (p) place(node, clamp(node, p.x, p.y));
    }
    function start(e) {
      const node = e.currentTarget.closest(selector) ?? e.currentTarget;
      const rect = node.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      let moved = false;
      const move = (ev) => {
        const current = root.querySelector(selector);
        if (!current) return;
        const parentRect = current.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
        moved = true;
        pos = clamp(current, ev.clientX - parentRect.left - dx, ev.clientY - parentRect.top - dy);
        place(current, pos);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (!moved) return;
        justDragged = true;
        setTimeout(() => (justDragged = false), 250);
        try {
          localStorage.setItem(key, JSON.stringify(pos));
        } catch {
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }
    return { start, apply };
  }
  const pipDrag = makeDraggable("shalter.callPipPos", ".call-local-pip");
  const stripDrag = makeDraggable("shalter.callStripPos", ".call-stage-strip");
  let stripHidden = false;
  let localVideoEl = null;
  let screenPreviewEl = null;
  let linkStatus = null;

  async function inviteByLink() {
    if (!me.isPremium) return navigate("/settings/premium");
    linkStatus = "copying";
    render(getCallState());
    try {
      const url = await createInviteLink();
      await navigator.clipboard.writeText(url).catch(() => {});
      linkStatus = "copied";
    } catch (err) {
      linkStatus = err.message || "Не удалось создать ссылку";
    }
    render(getCallState());
    setTimeout(() => {
      linkStatus = null;
      render(getCallState());
    }, 2000);
  }

  function render(s) {
    if (!s || s.call.id !== callId) return;
    if (s.minimized) return;
    if (s.phase === "ended") {
      mount(root, el("div", { class: "call-screen ended" }, [el("p", {}, "Звонок завершён")]));
      return;
    }

    const label = s.phase === "ringing" ? "Вызов…" : formatElapsed(s.elapsed);

    const mediaOf = (p) => s.remoteMedia?.[p.id] ?? { camera: s.call.kind === "video", sharing: false };
    const remoteSharerId = s.sharing ? null : s.others.find((p) => mediaOf(p).sharing)?.id ?? null;
    stageMode = s.sharing || !!remoteSharerId;
    const swap = swapped && !stageMode;

    const liveKeys = new Set();
    function mediaNode(key, kind, stream) {
      liveKeys.add(key);
      let cached = remoteMediaEls.get(key);
      if (!cached || cached.kind !== kind) {
        const node =
          kind === "video"
            ? el("video", { autoplay: true, playsinline: true, muted: true, class: "call-tile-video" })
            : el("audio", { autoplay: true });
        cached = { el: node, kind };
        remoteMediaEls.set(key, cached);
      }
      if (cached.el.srcObject !== stream) cached.el.srcObject = stream;
      return cached.el;
    }
    const hasVideo = (stream) => !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");

    function buildTile(p, role) {
      const m = mediaOf(p);
      const main = s.remoteStreams[p.id] ?? null;
      let stream = null;
      let key = p.id;
      if (role === "stage") {
        stream = main;
      } else if (role === "strip" && p.id === remoteSharerId) {
        stream = m.camera ? s.remoteCamStreams?.[p.id] ?? null : null;
        key = `${p.id}:cam`;
      } else if (swap) {
        stream = s.cameraOn ? s.localStream : null;
        key = `${p.id}:swap`;
      } else if (m.camera || m.sharing) {
        stream = main;
      }
      const showVideo = hasVideo(stream);
      const isConnected = !!s.connectedPeers[p.id];
      const small = role === "strip";

      const tile = el("div", { class: `call-tile ${role === "stage" ? "stage" : ""}` }, [
        showVideo
          ? mediaNode(key, "video", stream)
          : el("div", { class: "call-tile-avatar-wrap" }, [
              Avatar({ name: p.name, color: p.avatarColor, image: p.avatarImage, size: small ? 40 : 72 }),
              el("p", { class: "call-tile-name" }, p.name),
            ]),
        role === "stage" ? el("p", { class: "call-stage-label" }, `Экран: ${p.name}`) : null,
        showVideo && small ? el("p", { class: "call-tile-caption" }, p.name) : null,
        el("p", { class: "call-tile-status" }, s.phase === "ringing" ? "вызов…" : isConnected ? "" : "соединение…"),
        s.call.callerId === me.id && role !== "stage"
          ? el("button", {
              class: "icon-btn call-tile-remove",
              title: `Убрать из звонка: ${p.name}`,
              html: iconSvg("X", 15),
              onclick: async () => {
                if (!(await askConfirm(`Убрать ${p.name} из звонка?`))) return;
                try {
                  await api.removeCallParticipant(s.call.id, p.id);
                } catch (err) {
                  alert(err.message || "Не удалось убрать участника");
                }
              },
            })
          : null,
      ].filter(Boolean));
      tile.addEventListener("dblclick", (e) => {
        e.preventDefault();
        toggleFullscreen(tile);
      });
      if (!stageMode) {
        tile.style.cursor = "pointer";
        tile.title = swapped ? "Вернуть как было" : "Показать себя крупно";
        tile.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          toggleSwap();
        });
      } else {
        tile.title = p.name;
      }
      return tile;
    }

    let callArea;
    if (stageMode) {
      let stage;
      if (s.sharing) {
        if (!screenPreviewEl) {
          screenPreviewEl = el("video", { autoplay: true, muted: true, playsinline: true, class: "call-tile-video" });
        }
        if (screenPreviewEl.srcObject !== s.screenStream) screenPreviewEl.srcObject = s.screenStream;
        stage = el("div", { class: "call-tile stage", ondblclick: (e) => { e.preventDefault(); toggleFullscreen(e.currentTarget); } }, [
          screenPreviewEl,
          el("p", { class: "call-stage-label" }, "Вы показываете экран"),
        ]);
      } else {
        stage = buildTile(s.others.find((p) => p.id === remoteSharerId), "stage");
      }
      const stripTiles = s.others.map((p) => buildTile(p, "strip"));
      callArea = el("div", { class: "call-stage" }, [
        stage,
        stripTiles.length
          ? el("div", { class: `call-stage-strip ${stripHidden ? "collapsed" : ""}` }, [
              el(
                "div",
                {
                  class: "call-stage-strip-bar",
                  title: "Перетащите, чтобы передвинуть",
                  onpointerdown: (e) => {
                    if (e.target.closest("button")) return;
                    stripDrag.start(e);
                  },
                },
                [
                  el("span", { class: "call-stage-strip-grip", html: iconSvg("Users", 14) }),
                  el("span", { class: "call-stage-strip-count" }, `Участники · ${stripTiles.length}`),
                  el(
                    "button",
                    {
                      class: "call-stage-strip-toggle",
                      title: stripHidden ? "Показать участников" : "Скрыть участников",
                      onclick: () => {
                        stripHidden = !stripHidden;
                        render(getCallState());
                      },
                    },
                    stripHidden ? "Показать" : "Скрыть"
                  ),
                ]
              ),
              stripHidden ? null : el("div", { class: "call-stage-strip-tiles" }, stripTiles),
            ])
          : null,
      ]);
    } else {
      screenPreviewEl = null;
      callArea = el(
        "div",
        {
          class: `call-tiles-grid ${s.others.length === 1 ? "solo" : ""}`,
          style: { gridTemplateColumns: `repeat(${Math.min(s.others.length, 2) || 1}, minmax(0,1fr))` },
        },
        s.others.length ? s.others.map((p) => buildTile(p, "grid")) : [el("p", { class: "call-empty-hint" }, "Ожидание участников…")]
      );
    }

    for (const key of [...remoteMediaEls.keys()]) {
      if (!liveKeys.has(key)) remoteMediaEls.delete(key);
    }

    const localPip = el("div", {
      class: "call-local-pip",
      onpointerdown: pipDrag.start,
      onclick: toggleSwap,
      ondblclick: (e) => { e.preventDefault(); toggleFullscreen(e.currentTarget); },
      title: stageMode
        ? "Двойное нажатие — на весь экран"
        : swapped
          ? "Вернуть как было"
          : "Показать себя крупно · двойное нажатие — на весь экран",
    }, [
      (() => {
        const first = s.others[0];
        const pipStream = swap
          ? first && (mediaOf(first).camera || mediaOf(first).sharing) ? s.remoteStreams[first.id] ?? null : null
          : s.cameraOn ? s.localStream : null;
        if (!hasVideo(pipStream)) {
          const who = swap && first ? first : me;
          return el("div", { class: "call-local-avatar" }, [Avatar({ name: who.name, color: who.avatarColor, image: who.avatarImage, size: 48 })]);
        }
        if (!localVideoEl) {
          localVideoEl = el("video", { autoplay: true, muted: true, playsinline: true, class: "call-local-video" });
        }
        if (localVideoEl.srcObject !== pipStream) localVideoEl.srcObject = pipStream;
        localVideoEl.classList.toggle("mirrored", !swap && !s.facingBack);
        return localVideoEl;
      })(),
      s.cameraOn && (s.cameraCount ?? 1) > 1
        ? el("button", { class: "call-flip-btn", html: iconSvg("FlipCamera", 14), title: "Другая камера", onclick: flipCamera })
        : null,
      s.cameraError ? el("p", { class: "call-camera-error" }, s.cameraError) : null,
      s.switchingCamera ? el("div", { class: "call-camera-switching" }, "Переключаю камеру…") : null,
    ]);

    const canAddParticipant = true;

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
          el("button", {
            class: "call-header-btn",
            html: iconSvg("Copy", 18),
            title: me.isPremium ? "Пригласить по ссылке" : "Ссылка на звонок — только с Shalter Premium",
            onclick: inviteByLink,
          }),
        ]),
        s.mediaError ? el("p", { class: "call-media-error" }, s.mediaError) : null,
        s.connectionError ? el("p", { class: "call-media-error" }, s.connectionError) : null,
        linkStatus
          ? el(
              "p",
              { class: "call-media-error link" },
              linkStatus === "copying" ? "Создаём ссылку…" : linkStatus === "copied" ? "Ссылка скопирована ✓" : linkStatus
            )
          : null,
        callArea,
        localPip,
        el("div", { class: "call-controls" }, [
          el("button", {
            class: `call-control-btn ${s.muted ? "active" : ""}`,
            title: "Микрофон",
            html: iconSvg("Mic", 20),
            onclick: toggleMute,
          }),
          el("button", {
            class: `call-control-btn ${!s.cameraOn && s.call.kind === "video" ? "active" : ""} ${s.cameraOn && s.call.kind !== "video" ? "accent" : ""}`,
            title: s.cameraOn ? "Выключить камеру" : "Включить камеру",
            html: iconSvg("Video", 20),
            onclick: toggleCamera,
          }),
          el("button", {
            class: `call-control-btn ${s.sharing ? "accent" : ""}`,
            title: s.sharing ? "Остановить показ экрана" : "Демонстрация экрана",
            html: iconSvg("Monitor", 20),
            onclick: toggleScreenShare,
          }),
          volumeControl,
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
    applyVolumeToAll();
    const pip = root.querySelector(".call-local-pip");
    if (pip) pipDrag.apply(pip);
    const strip = root.querySelector(".call-stage-strip");
    if (strip) stripDrag.apply(strip);
  }

  async function openAddParticipantMenu(e, s) {
    const inCall = (id) => id === me.id || s.others.some((o) => o.id === id);
    let members = [];
    try {
      ({ members } = await api.getChat(s.call.chatId));
    } catch {
    }
    const candidates = members.filter((m) => !inCall(m.id));

    const fromContacts = {
      icon: "Accounts",
      label: "Из контактов…",
      onClick: () =>
        openContactPickerDialog((user) => {
          if (inCall(user.id)) return;
          addParticipant(user.id).catch((err) => alert(err.message || "Не удалось добавить участника"));
        }, "Кого добавить в звонок", { exclude: [getState().user?.id] }),
    };

    openDropdownMenu({ x: e.clientX, y: e.clientY }, [
      ...(candidates.length
        ? [
            ...candidates.map((c) => ({
              icon: "Accounts",
              label: c.name,
              onClick: () => addParticipant(c.id).catch((err) => alert(err.message || "Не удалось добавить участника")),
            })),
            { separator: true },
          ]
        : []),
      fromContacts,
    ]);
  }

  render(getCallState());
  const unsub = subscribeCall(render);
  root._cleanup = () => unsub();
}

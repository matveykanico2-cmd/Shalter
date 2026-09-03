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

  // render() rebuilds the whole tree every tick (the elapsed-time timer calls
  // notify() once a second). Reusing the actual <video>/<audio> nodes across
  // renders — instead of calling el() fresh each time — means mount()'s
  // clear+append just moves the existing element, which browsers treat as a
  // no-op for an already-playing stream. Recreating the node instead would
  // tear down and restart playback every second.
  const remoteMediaEls = new Map(); // participantId -> { el, kind }
  // По той же причине, что и <video> выше, ползунок громкости создаётся один
  // раз: render() пересобирает дерево раз в секунду (таймер длительности), а
  // ползунок, пересозданный под пальцем, бросает перетаскивание на полпути.
  const volumeControl = VolumeControl();

  // Кто сейчас в большом окне, а кто в маленьком. Нажатие меняет их местами —
  // так же, как в других мессенджерах: во время видеозвонка чаще нужно
  // разглядеть себя (что попадает в кадр), чем собеседника, и наоборот.
  let swapped = false;
  // Ставится сразу после перетаскивания своего окна — чтобы отпускание пальца
  // не сработало ещё и как нажатие.
  let justDragged = false;
  // Развернуть на весь экран — двойным нажатием по картинке. Работает и на
  // телефоне, и на компьютере: браузеры принимают dblclick и там, и там.
  //
  // Разворачивается вся область звонка, а не один элемент: иначе кнопки
  // управления и своё окно остались бы за кадром.
  function toggleFullscreen(node) {
    const target = node?.closest(".call-screen") ?? node;
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else target.requestFullscreen?.().catch(() => {});
  }

  const toggleSwap = () => {
    if (justDragged) return;
    swapped = !swapped;
    render(getCallState());
  };

  // Своё окно камеры можно двигать пальцем.
  //
  // Оно висело в правом нижнем углу и накрывало собой кнопку «Завершить» —
  // особенно на узком экране, где панель кнопок переносится в две строки и
  // становится выше. Кнопка под окном не нажимается вовсе, то есть из звонка
  // не выйти.
  //
  // Положение запоминается: человек один раз отодвинул — и оно там же в
  // следующем звонке.
  const PIP_POS_KEY = "shalter.callPipPos";
  // Позиция окна держится здесь, а не только в стилях узла.
  //
  // render() пересобирает дерево раз в секунду — по таймеру длительности
  // разговора. Пока окно тащили, положение жило в style у старого узла, и
  // очередная перерисовка создавала новый — без него. Окно прыгало на место по
  // умолчанию, а если его успели утащить далеко, выглядело это как «пропало».
  let pipPos = null;
  function readPipPos() {
    if (pipPos) return pipPos;
    try {
      const raw = JSON.parse(localStorage.getItem(PIP_POS_KEY) || "null");
      pipPos = raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : null;
      return pipPos;
    } catch {
      return null;
    }
  }
  function clampPip(node, x, y) {
    const w = node.offsetWidth || 112;
    const h = node.offsetHeight || 112;
    // Не даём утащить окно за край экрана — вернуть его оттуда было бы нечем.
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - h - 8)),
    };
  }
  function applyPipPos(node) {
    const pos = readPipPos();
    if (!pos) return; // не трогали — остаётся место по умолчанию из стилей
    // Окно браузера могли уменьшить с прошлого раза — тогда сохранённая точка
    // окажется за краем, и окно станет невидимым. clampPip возвращает его.
    const { x, y } = clampPip(node, pos.x, pos.y);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.style.right = "auto";
    node.style.bottom = "auto";
  }
  function startPipDrag(e) {
    const node = e.currentTarget;
    const rect = node.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    let moved = false;
    node.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      moved = true;
      const { x, y } = clampPip(node, ev.clientX - dx, ev.clientY - dy);
      // Запоминаем сразу, а не только когда отпустят: перерисовка может
      // случиться посреди перетаскивания, и новый узел должен встать туда же.
      pipPos = { x, y };
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
    };
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      if (!moved) return;
      // Окно тащили, а не нажимали: гасим ближайший клик, иначе каждое
      // перетаскивание заодно меняло бы окна местами.
      justDragged = true;
      setTimeout(() => (justDragged = false), 250);
      try {
        localStorage.setItem(PIP_POS_KEY, JSON.stringify(pipPos ?? { x: parseFloat(node.style.left), y: parseFloat(node.style.top) }));
      } catch {
        // Хранилище недоступно — окно всё равно останется где поставили, до конца звонка.
      }
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
  }
  let localVideoEl = null;
  let linkStatus = null; // null | "copying" | "copied" | error message

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
          // При обмене местами в большой плитке показывается своя картинка, а
          // картинка собеседника уезжает в маленькое окно.
          const remoteStream = swapped && s.localStream ? s.localStream : s.remoteStreams[p.id] ?? null;
          const isConnected = !!s.connectedPeers[p.id];
          const showVideo = s.call.kind === "video" && remoteStream && remoteStream.getVideoTracks().length > 0;
          const kind = showVideo ? "video" : s.call.kind === "audio" ? "audio" : null;

          let mediaEl = null;
          if (kind) {
            const cached = remoteMediaEls.get(p.id);
            if (cached && cached.kind === kind) {
              mediaEl = cached.el;
            } else {
              mediaEl =
                kind === "video"
                  ? el("video", { autoplay: true, playsinline: true, class: "call-tile-video" })
                  : el("audio", { autoplay: true });
              remoteMediaEls.set(p.id, { el: mediaEl, kind });
            }
            // el() only wires on*/props — srcObject needs a real assignment, not an attribute.
            if (mediaEl.srcObject !== remoteStream) mediaEl.srcObject = remoteStream;
          }

          const tile = el("div", { class: "call-tile" }, [
            showVideo
              ? mediaEl
              : el("div", { class: "call-tile-avatar-wrap" }, [
                  Avatar({ name: p.name, color: p.avatarColor, image: p.avatarImage, size: 72 }),
                  el("p", { class: "call-tile-name" }, p.name),
                  s.call.kind === "audio" ? mediaEl : null,
                ]),
            el("p", { class: "call-tile-status" }, s.phase === "ringing" ? "вызов…" : isConnected ? "" : "соединение…"),
            // The counterpart of "add participant": whoever started the call can
            // put someone out of it. Without this a call you could pull anyone
            // into could only be escaped by everyone else hanging up.
            s.call.callerId === me.id
              ? el("button", {
                  class: "icon-btn call-tile-remove",
                  title: `Убрать из звонка: ${p.name}`,
                  html: iconSvg("X", 15),
                  onclick: async () => {
                    if (!confirm(`Убрать ${p.name} из звонка?`)) return;
                    try {
                      await api.removeCallParticipant(s.call.id, p.id);
                    } catch (err) {
                      alert(err.message || "Не удалось убрать участника");
                    }
                  },
                })
              : null,
          ].filter(Boolean));
          tile.style.cursor = "pointer";
          tile.addEventListener("dblclick", (e) => {
            e.preventDefault();
            toggleFullscreen(tile);
          });
          tile.title = swapped ? "Вернуть как было" : "Показать себя крупно";
          tile.addEventListener("click", (e) => {
            // Не перехватываем нажатия на кнопки внутри плитки (например,
            // «убрать участника»).
            if (e.target.closest("button")) return;
            toggleSwap();
          });
          return tile;
        })
      : [el("p", { class: "call-empty-hint" }, "Ожидание участников…")];

    for (const id of [...remoteMediaEls.keys()]) {
      if (!s.others.some((p) => p.id === id)) remoteMediaEls.delete(id);
    }

    const localPip =
      s.call.kind === "video"
        ? el("div", {
            class: "call-local-pip",
            onpointerdown: startPipDrag,
            onclick: toggleSwap,
            ondblclick: (e) => { e.preventDefault(); toggleFullscreen(e.currentTarget); },
            title: swapped ? "Вернуть как было" : "Показать себя крупно · двойное нажатие — на весь экран",
          }, [
            s.cameraOn
              ? (() => {
                  if (!localVideoEl) {
                    localVideoEl = el("video", { autoplay: true, muted: true, playsinline: true, class: "call-local-video" });
                  }
                  // При обмене местами здесь показывается собеседник, а своя
                  // картинка уходит в большое окно.
                  const pipStream = swapped ? s.remoteStreams[s.others[0]?.id] ?? s.localStream : s.localStream;
                  if (localVideoEl.srcObject !== pipStream) localVideoEl.srcObject = pipStream;
                  localVideoEl.classList.toggle("mirrored", !s.facingBack);
                  return localVideoEl;
                })()
              : el("div", { class: "call-local-avatar" }, [Avatar({ name: me.name, color: me.avatarColor, image: me.avatarImage, size: 48 })]),
            // Кнопка есть, пока камер больше одной: на ноутбуке с единственной
            // вебкой переворачивать нечего, и кнопка там только обманывала.
            s.cameraOn && (s.cameraCount ?? 1) > 1
              ? el("button", { class: "call-flip-btn", html: iconSvg("FlipCamera", 14), title: "Другая камера", onclick: flipCamera })
              : null,
            // Причина неудачи — прямо на видео, а не в консоли.
            s.cameraError ? el("p", { class: "call-camera-error" }, s.cameraError) : null,
          ])
        : null;

    // Any call, not just a group one: adding a third person to a one-to-one
    // call is exactly how a group call starts, and it was refused outright.
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
        el(
          "div",
          {
            // Один собеседник — картинка на всю площадь, а не окошко в
            // четыреста точек посреди пустого экрана. Несколько — обычная сетка.
            class: `call-tiles-grid ${s.others.length === 1 ? "solo" : ""}`,
            style: { gridTemplateColumns: `repeat(${Math.min(s.others.length, 2) || 1}, minmax(0,1fr))` },
          },
          tiles
        ),
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
    // Новый участник — новый <video>, и он приходит с громкостью браузера по
    // умолчанию. Прогоняем сохранённую громкость по всему, что сейчас на
    // экране, после каждой сборки.
    applyVolumeToAll();
    // Запомненное положение своего окна — после сборки дерева, когда узел уже
    // на экране и у него есть размеры.
    const pip = root.querySelector(".call-local-pip");
    if (pip) applyPipPos(pip);
  }

  async function openAddParticipantMenu(e, s) {
    const inCall = (id) => id === me.id || s.others.some((o) => o.id === id);
    let members = [];
    try {
      ({ members } = await api.getChat(s.call.chatId));
    } catch {
      // A call can outlive access to its chat; the contact route below still works.
    }
    const candidates = members.filter((m) => !inCall(m.id));

    const fromContacts = {
      icon: "Accounts",
      label: "Из контактов…",
      onClick: () =>
        openContactPickerDialog((user) => {
          if (inCall(user.id)) return;
          addParticipant(user.id).catch((err) => alert(err.message || "Не удалось добавить участника"));
        }, "Кого добавить в звонок"),
    };

    openDropdownMenu({ x: e.clientX, y: e.clientY }, [
      // Chat members first — in a group call that's who you mean nine times out
      // of ten. In a one-to-one call there are none left, so contacts is the
      // whole menu rather than a dead "все уже в звонке" line.
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

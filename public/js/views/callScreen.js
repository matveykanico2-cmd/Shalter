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
  // Идёт демонстрация экрана (своя или чья-то): экран на всю площадь, окна
  // участников — полоской поверх него. Обмен местами тут не действует.
  let stageMode = false;
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
    if (justDragged || stageMode) return;
    swapped = !swapped;
    render(getCallState());
  };

  // Своё окно камеры и полоску участников поверх демонстрации можно двигать
  // пальцем.
  //
  // Окно камеры висело в правом нижнем углу и накрывало собой кнопку
  // «Завершить» — особенно на узком экране, где панель кнопок переносится в две
  // строки и становится выше. Кнопка под окном не нажимается вовсе, то есть из
  // звонка не выйти. Полоска участников так же закрывает собой то, что
  // показывают, — её убирают туда, где на экране пусто.
  //
  // Положение запоминается: человек один раз отодвинул — и оно там же в
  // следующем звонке.
  //
  // Позиция держится здесь, а не только в стилях узла. render() пересобирает
  // дерево раз в секунду — по таймеру длительности разговора. Пока окно
  // тащили, положение жило в style у старого узла, и очередная перерисовка
  // создавала новый — без него. Окно прыгало на место по умолчанию, а если его
  // успели утащить далеко, выглядело это как «пропало». По той же причине
  // движение слушается на window, а узел каждый раз ищется заново: старый к
  // тому времени уже снят с экрана и событий не получает.
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
    // Не даём утащить за край — вернуть оттуда было бы нечем. Координаты — от
    // угла области, в которой узел лежит, а не от угла окна браузера.
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
    // После сборки дерева, когда узел уже на экране и у него есть размеры.
    // Окно браузера могли уменьшить с прошлого раза — тогда сохранённая точка
    // окажется за краем; clamp возвращает её в видимую область.
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
        // Дрожание пальца при нажатии — ещё не перетаскивание.
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
        // Тащили, а не нажимали: гасим ближайший клик, иначе каждое
        // перетаскивание своего окна заодно меняло бы окна местами.
        justDragged = true;
        setTimeout(() => (justDragged = false), 250);
        try {
          localStorage.setItem(key, JSON.stringify(pos));
        } catch {
          // Хранилище недоступно — останется где поставили, до конца звонка.
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
  // Полоску участников поверх демонстрации можно свернуть в одну строку —
  // когда нужно разглядеть экран целиком.
  let stripHidden = false;
  let localVideoEl = null;
  let screenPreviewEl = null;
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

    // Что у собеседника с камерой и экраном — из его сигнала "media"
    // (callController.js). Пока сигнал не дошёл, судим по виду звонка.
    const mediaOf = (p) => s.remoteMedia?.[p.id] ?? { camera: s.call.kind === "video", sharing: false };
    // Чей экран в центре: свой важнее — показывающий должен видеть, что уходит.
    const remoteSharerId = s.sharing ? null : s.others.find((p) => mediaOf(p).sharing)?.id ?? null;
    stageMode = s.sharing || !!remoteSharerId;
    const swap = swapped && !stageMode;

    // <video> переиспользуются между перерисовками — см. комментарий у
    // remoteMediaEls. Все картинки идут без звука (muted): звук собеседников
    // выводит постоянный <audio>-приёмник в оболочке приложения (app.js), а не
    // экран звонка, — иначе он пропадал бы при уходе с экрана. Поэтому, где бы
    // ни оказалась картинка собеседника, звук с ней не дублируется.
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
      // el() only wires on*/props — srcObject needs a real assignment, not an attribute.
      if (cached.el.srcObject !== stream) cached.el.srcObject = stream;
      return cached.el;
    }
    const hasVideo = (stream) => !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");

    // role: "grid" — обычная сетка, "stage" — экран собеседника в центре,
    // "strip" — маленькое окно в полоске поверх демонстрации.
    function buildTile(p, role) {
      const m = mediaOf(p);
      const main = s.remoteStreams[p.id] ?? null;
      let stream = null;
      let key = p.id;
      if (role === "stage") {
        stream = main;
      } else if (role === "strip" && p.id === remoteSharerId) {
        // Экран этого собеседника уже в центре — здесь его камера, если
        // включена: она приходит вторым потоком (callController.js).
        stream = m.camera ? s.remoteCamStreams?.[p.id] ?? null : null;
        key = `${p.id}:cam`;
      } else if (swap) {
        // При обмене местами в большой плитке показывается своя картинка, а
        // картинка собеседника уезжает в маленькое окно.
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
        // The counterpart of "add participant": whoever started the call can
        // put someone out of it. Without this a call you could pull anyone
        // into could only be escaped by everyone else hanging up.
        s.call.callerId === me.id && role !== "stage"
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
      tile.addEventListener("dblclick", (e) => {
        e.preventDefault();
        toggleFullscreen(tile);
      });
      if (!stageMode) {
        tile.style.cursor = "pointer";
        tile.title = swapped ? "Вернуть как было" : "Показать себя крупно";
        tile.addEventListener("click", (e) => {
          // Не перехватываем нажатия на кнопки внутри плитки (например,
          // «убрать участника»).
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
          // Один собеседник — картинка на всю площадь, а не окошко в
          // четыреста точек посреди пустого экрана. Несколько — обычная сетка.
          class: `call-tiles-grid ${s.others.length === 1 ? "solo" : ""}`,
          style: { gridTemplateColumns: `repeat(${Math.min(s.others.length, 2) || 1}, minmax(0,1fr))` },
        },
        s.others.length ? s.others.map((p) => buildTile(p, "grid")) : [el("p", { class: "call-empty-hint" }, "Ожидание участников…")]
      );
    }

    for (const key of [...remoteMediaEls.keys()]) {
      if (!liveKeys.has(key)) remoteMediaEls.delete(key);
    }

    // Своё окно — в любом звонке: голосовой звонок — это тот же видеозвонок с
    // выключенной камерой, и камеру в нём можно включить (callController.js).
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
        // При обмене местами здесь показывается собеседник, а своя картинка
        // уходит в большое окно.
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
      // Кнопка есть, пока камер больше одной: на ноутбуке с единственной
      // вебкой переворачивать нечего, и кнопка там только обманывала.
      s.cameraOn && (s.cameraCount ?? 1) > 1
        ? el("button", { class: "call-flip-btn", html: iconSvg("FlipCamera", 14), title: "Другая камера", onclick: flipCamera })
        : null,
      // Причина неудачи — прямо на видео, а не в консоли.
      s.cameraError ? el("p", { class: "call-camera-error" }, s.cameraError) : null,
    ]);

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
        callArea,
        localPip,
        el("div", { class: "call-controls" }, [
          el("button", {
            class: `call-control-btn ${s.muted ? "active" : ""}`,
            title: "Микрофон",
            html: iconSvg("Mic", 20),
            onclick: toggleMute,
          }),
          // В любом звонке, не только в видео: голосовой — это видеозвонок с
          // выключенной камерой. Подсветка — только у выключенной камеры в
          // видеозвонке, как у выключенного микрофона: в голосовом выключенная
          // камера — обычное состояние, а не «что-то отключено».
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
    // Новый участник — новый <video>, и он приходит с громкостью браузера по
    // умолчанию. Прогоняем сохранённую громкость по всему, что сейчас на
    // экране, после каждой сборки.
    applyVolumeToAll();
    // Запомненное положение своего окна — после сборки дерева, когда узел уже
    // на экране и у него есть размеры.
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

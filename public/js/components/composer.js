import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { startRecording, isRecordingSupported, createLevelMeter, MAX_RECORD_SEC } from "../lib/recorder.js";
import { fileToImageUpload } from "../lib/image.js";
import { uploadFile } from "../lib/upload.js";
import { checkSize } from "../lib/uploadLimits.js";
import { openPollDialog } from "./pollDialog.js";
import { openContactPickerDialog } from "./contactPickerDialog.js";
import { openScheduleSendDialog } from "./scheduleSendDialog.js";
import { STICKERS, DRAWN_STICKERS } from "../lib/stickers.js";
import { renderScene } from "../lib/animScenes.js";
import { openStickerPackDialog } from "./stickerPackDialog.js";
import { checkText, applyFix, applyAll, fragment } from "../lib/hugo.js";

const EMOJI = ["😀", "😂", "😍", "👍", "🙏", "🔥", "🎉", "😢", "😮", "❤️", "👏", "🤔"];
const TYPING_PING_MS = 2500; // well under the server's 4s typing-presence expiry
const DRAFT_SAVE_MS = 600; // debounce so we're not POSTing on every keystroke
// 1600 точек по длинной стороне — нормальное качество: фотография остаётся
// фотографией, текст на снимке документа читается.
//
// Место это больше не съедает так, как раньше: картинки хранятся в webp,
// одинаковые файлы лежат на диске в одном экземпляре, а полный файл убирается
// с сервера после того, как его получили все, — вместо него остаётся эскиз.
// Экономия теперь достигается этим, а не порчей снимков.
const MAX_IMAGE_DIMENSION = 1600;
// Эскиз: его задача — быть узнаваемым, а не разглядываемым.
const THUMB_DIMENSION = 240;

// "1 ошибку / 2 ошибки / 5 ошибок" — a count next to an unagreed noun reads as
// broken Russian, and Hugo's whole point is noticing exactly that.
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
}

export function Composer({
  chatId,
  replyingTo,
  editingMessage,
  initialDraft,
  // A bot's command list, when this chat has a bot in it (server/routes/chats.js
  // returns it with the chat). Absent everywhere else, and the "/" button then
  // isn't rendered at all.
  botCommands = null,
  members,
  onCancelReply,
  onCancelEdit,
  onSend,
  onSaveEdit,
  onDraftChange,
  onScheduled,
}) {
  let lastTypingPing = 0;
  let recordingHandle = null;
  // Волна рисуется кадрами, а звук слушается через AudioContext — и то и другое
  // надо остановить, когда запись кончилась: иначе кадры продолжают крутиться,
  // а микрофонный контекст остаётся открытым.
  let waveTimer = null;
  let levelMeter = null;
  let draftSaveTimer = null;

  // Saves to the server on a debounce (network call), but calls
  // onDraftChange immediately every time so chatView.js can reflect the
  // draft in the chat-list preview without waiting on the network.
  function scheduleDraftSave(text) {
    onDraftChange?.(text);
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => api.setDraft(chatId, text).catch(() => {}), DRAFT_SAVE_MS);
  }
  function clearDraft() {
    clearTimeout(draftSaveTimer);
    onDraftChange?.("");
    api.setDraft(chatId, "").catch(() => {});
  }

  const wrap = el("div", { class: "composer" });
  const banner = renderBanner();
  const bodySlot = el("div", {});
  wrap.append(...[banner, bodySlot].filter(Boolean));
  renderIdleBody();

  function renderBanner() {
    return replyingTo || editingMessage
      ? el("div", { class: "composer-banner" }, [
          el("span", { html: iconSvg(editingMessage ? "Edit" : "Reply", 15) }),
          el("div", { class: "composer-banner-body" }, [
            el("span", { class: "composer-banner-label" }, editingMessage ? "Изменение" : "Ответ"),
            el("span", { class: "composer-banner-text" }, (editingMessage ?? replyingTo).text || "Медиа"),
          ]),
          el("button", {
            class: "composer-banner-close",
            html: iconSvg("X", 14),
            onclick: () => (editingMessage ? onCancelEdit() : onCancelReply()),
          }),
        ])
      : null;
  }

  function renderIdleBody() {
    clear(bodySlot);

    const textarea = el("textarea", {
      class: "composer-textarea",
      rows: 1,
      placeholder: "Сообщение",
      value: editingMessage?.text ?? initialDraft ?? "",
    });

    // @mention autocomplete — matches an "@" that starts at a word boundary
    // and runs up to the cursor with no space in between (so "a@b" doesn't
    // trigger it, but "hey @niko" does mid-word too).
    const mentionMenu = el("div", { class: "composer-mention-menu hidden" });
    let mentionMatches = [];
    let mentionActiveIndex = 0;

    function currentMentionQuery() {
      const before = textarea.value.slice(0, textarea.selectionStart);
      const m = before.match(/(?:^|\s)@(\w*)$/);
      return m ? m[1] : null;
    }
    function renderMentionMenu() {
      clear(mentionMenu);
      mentionMatches.forEach((u, i) =>
        mentionMenu.appendChild(
          el(
            "button",
            {
              class: `composer-mention-item ${i === mentionActiveIndex ? "active" : ""}`,
              // mousedown (not click) + preventDefault so the textarea never
              // blurs — a blur would run our own close-on-blur handler and
              // rip this button out of the DOM before its click could fire.
              onmousedown: (e) => {
                e.preventDefault();
                selectMention(u);
              },
            },
            [el("span", { class: "composer-mention-name" }, u.name), el("span", { class: "composer-mention-username" }, `@${u.username}`)]
          )
        )
      );
    }
    function updateMentionMenu() {
      const query = currentMentionQuery();
      const q = query?.toLowerCase();
      mentionMatches =
        q === undefined || q === null || !members?.length
          ? []
          : members
              .filter((u) => u.username && (u.username.toLowerCase().startsWith(q) || u.name.toLowerCase().includes(q)))
              .slice(0, 6);
      if (!mentionMatches.length) {
        mentionMenu.classList.add("hidden");
        clear(mentionMenu);
        return;
      }
      mentionActiveIndex = 0;
      renderMentionMenu();
      mentionMenu.classList.remove("hidden");
    }
    function closeMentionMenu() {
      mentionMatches = [];
      mentionMenu.classList.add("hidden");
      clear(mentionMenu);
    }
    function selectMention(user) {
      const pos = textarea.selectionStart;
      const before = textarea.value.slice(0, pos).replace(/@(\w*)$/, `@${user.username} `);
      textarea.value = before + textarea.value.slice(pos);
      textarea.focus();
      textarea.setSelectionRange(before.length, before.length);
      closeMentionMenu();
      autoResize();
      updateTrailingButtons();
      if (!editingMessage) scheduleDraftSave(textarea.value);
    }

    function autoResize() {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 240) + "px";
    }

    function submit() {
      const trimmed = textarea.value.trim();
      if (!trimmed) return;
      if (editingMessage) onSaveEdit(trimmed);
      else {
        onSend(trimmed);
        clearDraft();
      }
      textarea.value = "";
      autoResize();
    }

    textarea.addEventListener("input", () => {
      autoResize();
      updateTrailingButtons();
      if (!editingMessage && textarea.value.trim() && Date.now() - lastTypingPing > TYPING_PING_MS) {
        lastTypingPing = Date.now();
        api.sendTyping(chatId).catch(() => {});
      }
      if (!editingMessage) scheduleDraftSave(textarea.value);
      updateMentionMenu();
    });
    textarea.addEventListener("keydown", (e) => {
      if (mentionMatches.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          mentionActiveIndex = (mentionActiveIndex + 1) % mentionMatches.length;
          renderMentionMenu();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          mentionActiveIndex = (mentionActiveIndex - 1 + mentionMatches.length) % mentionMatches.length;
          renderMentionMenu();
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          selectMention(mentionMatches[mentionActiveIndex]);
          return;
        }
        if (e.key === "Escape") {
          closeMentionMenu();
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    // Click elsewhere closes it too — menu items themselves prevent this
    // blur (see the mousedown handler above), so this only fires for
    // genuine "clicked away" cases.
    textarea.addEventListener("blur", () => closeMentionMenu());

    // Progress line shown above the composer while a file is going up. A large
    // file takes real time now that it's streamed rather than crammed into the
    // message JSON, so "nothing appears to happen" isn't an acceptable state.
    const uploadSlot = el("div", { class: "composer-upload-slot" });

    function showUploadError(message) {
      clear(uploadSlot);
      uploadSlot.appendChild(
        el("div", { class: "composer-upload-row error" }, [
          el("span", { html: iconSvg("Info", 14) }),
          el("span", { class: "composer-upload-label" }, message),
          el("button", { class: "icon-btn", title: "Скрыть", html: iconSvg("X", 14), onclick: () => clear(uploadSlot) }),
        ])
      );
    }

    // Uploads the file (streaming, with a progress bar), then sends the message
    // carrying a URL instead of the whole file. Images still get downscaled
    // client-side first when they're small enough to decode safely — that's a
    // deliberate product choice (chat photos, not archival originals); anything
    // bigger goes up untouched, since a canvas can't decode a huge photo without
    // taking the tab down with it. Send the original as a Файл to keep it exact.
    const CANVAS_SAFE_IMAGE_BYTES = 20 * 1024 * 1024;

    async function attachFile(file, kind) {
      const sizeError = checkSize(file, kind);
      if (sizeError) return showUploadError(sizeError);

      // Картинка уменьшается и уезжает файлом — тем же путём, что видео и
      // документы, — а в сообщение попадает ссылка на него.
      //
      // Раньше уменьшенная картинка вкладывалась в сообщение строкой data: и
      // так и оставалась в базе. Это дорого со всех сторон: base64 на треть
      // толще самой картинки; строка лежит в колонке сообщения, поэтому едет в
      // ответе всякий раз, когда читают историю чата, и занимает место в кэше
      // базы, вытесняя оттуда то, что действительно нужно; резервная копия
      // базы превращается в копию всех фотографий сразу. Файл на диске лишён
      // всего этого и отдаётся отдельным запросом, который браузер закэширует.
      //
      // Старые сообщения с data: продолжают открываться как раньше — ничего
      // переписывать не нужно, меняется только то, как кладутся новые.
      if (kind === "image" && file.size <= CANVAS_SAFE_IMAGE_BYTES) {
        try {
          const smaller = await fileToImageUpload(file, MAX_IMAGE_DIMENSION);
          const attachment = await uploadFile(smaller, "image");
          // Второй, крошечный файл — эскиз.
          //
          // Он нужен, чтобы уборка на сервере (lib/orphanSweep.js) могла
          // удалять полную картинку, когда её уже все получили, и при этом
          // ничего не пропадало: полный файл живёт у людей на устройствах, а
          // здесь остаётся то, что видно с любого нового телефона. Весит он
          // считанные килобайты, поэтому хранится всегда.
          let thumbUrl;
          try {
            const thumb = await fileToImageUpload(file, THUMB_DIMENSION);
            thumbUrl = (await uploadFile(thumb, "image")).url;
          } catch {
            // Эскиз не сделался — не повод не отправлять само сообщение.
          }
          onSend("", [{ ...attachment, kind: "image", name: file.name, thumbUrl }]);
        } catch (err) {
          showUploadError(err.message || "Не удалось обработать изображение");
        }
        return;
      }

      const bar = el("span", { class: "composer-upload-bar-fill" });
      const pct = el("span", { class: "mono composer-upload-pct" }, "0%");
      clear(uploadSlot);
      uploadSlot.appendChild(
        el("div", { class: "composer-upload-row" }, [
          el("span", { class: "composer-upload-label" }, file.name),
          el("span", { class: "composer-upload-bar" }, [bar]),
          pct,
        ])
      );

      try {
        const attachment = await uploadFile(file, kind, (fraction) => {
          const p = Math.round(fraction * 100);
          bar.style.width = `${p}%`;
          pct.textContent = `${p}%`;
        });
        clear(uploadSlot);
        onSend("", [attachment]);
      } catch (err) {
        showUploadError(err.message || "Не удалось загрузить файл");
      }
    }

    // Attach menu — each item sends a real attachment (no more "[Label]" text stub).
    // multiple — потому что выбирают обычно не один файл: пять фотографий с
    // прогулки прикреплялись по одной, через пять открытий проводника подряд.
    // Сообщение и так умеет нести несколько вложений сразу (attachments —
    // массив), одиночным было только само поле выбора.
    const mediaFileInput = el("input", {
      type: "file",
      accept: "image/*,video/*",
      multiple: true,
      class: "hidden-input",
      onchange: (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        for (const file of files) {
          if (file.type.startsWith("image/")) attachFile(file, "image");
          else if (file.type.startsWith("video/")) attachFile(file, "video");
          else attachFile(file, "file");
        }
      },
    });
    const anyFileInput = el("input", {
      type: "file",
      multiple: true,
      class: "hidden-input",
      onchange: (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        for (const file of files) attachFile(file, "file");
      },
    });

    let attachMenuEl = null;
    function closeAttachMenu() {
      attachMenuEl?.remove();
      attachMenuEl = null;
    }
    // Every composer action, in one list. The icon row beside the field is a set
    // of shortcuts into this list, not a separate feature set — on a phone there
    // is no room for seven icons next to a text field (they left it about
    // 100px wide), so the shortcuts collapse and the paperclip is how you reach
    // all of it. One definition, so the two never drift apart.
    function attachActions() {
      return [
        { icon: "Image", label: "Фото или видео", run: () => mediaFileInput.click() },
        { icon: "File", label: "Файл", run: () => anyFileInput.click() },
        { icon: "Sticker", label: "Стикер", run: () => toggleStickers(attachSlot) },
        { icon: "Smile", label: "Эмодзи", run: () => toggleEmoji(attachSlot) },
        {
          icon: "BarChart",
          label: "Опрос",
          run: () =>
            openPollDialog((question, options, { correctIndex } = {}) => {
              onSend(question, [
                {
                  kind: "poll",
                  meta: {
                    options,
                    votes: options.map(() => 0),
                    voterIds: options.map(() => []),
                    // null — обычный опрос; число — викторина с этим правильным
                    // ответом (см. pollDialog.js).
                    correctIndex: correctIndex ?? null,
                  },
                },
              ]);
            }),
        },
        {
          icon: "MapPin",
          label: "Геолокация",
          run: () => {
            if (!navigator.geolocation) return alert("Геолокация не поддерживается в этом браузере");
            navigator.geolocation.getCurrentPosition(
              (pos) => onSend("", [{ kind: "location", meta: { lat: pos.coords.latitude, lng: pos.coords.longitude } }]),
              () => alert("Не удалось получить местоположение")
            );
          },
        },
        {
          icon: "Users",
          label: "Контакт",
          run: () =>
            openContactPickerDialog((user) =>
              onSend("", [{ kind: "contact", meta: { userId: user.id, name: user.name, phone: user.phone } }])
            ),
        },
        // Recording needs a microphone/camera, and scheduling makes no sense
        // while editing a message that has already been sent.
        ...(isRecordingSupported()
          ? [
              { icon: "Mic", label: "Голосовое сообщение", run: () => beginRecording("voice") },
              { icon: "Video", label: "Видео-сообщение", run: () => beginRecording("video-note") },
            ]
          : []),
        { icon: "Check", label: "Проверить текст (Hugo)", run: () => runHugo() },
        ...(editingMessage ? [] : [{ icon: "Clock", label: "Отправить позже", run: scheduleSend }]),
      ];
    }

    const attachBtn = el("button", {
      class: "composer-icon-btn",
      title: "Вложение",
      html: iconSvg("Paperclip", 19),
      onclick: () => {
        if (attachMenuEl) return closeAttachMenu();
        attachMenuEl = el(
          "div",
          { class: "composer-attach-menu" },
          attachActions().map((a) =>
            el(
              "button",
              {
                class: "composer-attach-item",
                onclick: () => {
                  closeAttachMenu();
                  a.run();
                },
              },
              [el("span", { class: "composer-attach-icon", html: iconSvg(a.icon, 16) }), a.label]
            )
          )
        );
        attachSlot.appendChild(attachMenuEl);
      },
    });
    const attachSlot = el("div", { class: "composer-attach-slot" }, [attachBtn, mediaFileInput, anyFileInput]);

    // A bot's commands, the way Telegram's "/" button offers them. The list has
    // been stored since bots existed and was shown nowhere, so using a bot meant
    // already knowing what it answers to.
    let commandMenuEl = null;
    const commandSlot = botCommands?.length ? el("div", { class: "composer-attach-slot" }) : null;
    if (commandSlot) {
      const commandBtn = el("button", {
        class: "composer-icon-btn composer-command-btn",
        title: "Команды бота",
        onclick: () => {
          if (commandMenuEl) {
            commandMenuEl.remove();
            commandMenuEl = null;
            return;
          }
          commandMenuEl = el(
            "div",
            { class: "composer-attach-menu composer-command-menu" },
            botCommands.map((c) =>
              el(
                "button",
                {
                  class: "composer-attach-item",
                  onclick: () => {
                    commandMenuEl?.remove();
                    commandMenuEl = null;
                    // Sent straight away rather than typed into the field: a
                    // command is the whole message, and Telegram sends it on tap.
                    onSend(`/${String(c.command ?? c.name ?? "").replace(/^\//, "")}`, []);
                  },
                },
                [
                  el("span", { class: "composer-command-name mono" }, `/${String(c.command ?? c.name ?? "").replace(/^\//, "")}`),
                  c.description ? el("span", { class: "composer-command-desc" }, c.description) : null,
                ].filter(Boolean)
              )
            )
          );
          commandSlot.appendChild(commandMenuEl);
        },
      }, "/");
      commandSlot.appendChild(commandBtn);
    }

    // Emoji picker. Takes the element to hang off, because on a phone the icon
    // that normally opens it isn't on screen — it's in the paperclip menu, and
    // the picker has to anchor to the paperclip instead.
    let emojiMenuEl = null;
    function toggleEmoji(host = emojiSlot) {
      if (emojiMenuEl) {
        emojiMenuEl.remove();
        emojiMenuEl = null;
        return;
      }
      emojiMenuEl = el(
        "div",
        // Opened from the paperclip (the only way in on a phone) it hangs off
        // the left edge of the row, so it has to open rightwards or it lands
        // off the side of the screen.
        { class: `composer-emoji-picker ${host === attachSlot ? "anchored-left" : ""}` },
        EMOJI.map((e) =>
          el(
            "button",
            {
              onclick: () => {
                textarea.value += e;
                autoResize();
                textarea.focus();
                if (!editingMessage) scheduleDraftSave(textarea.value);
              },
            },
            e
          )
        )
      );
      host.appendChild(emojiMenuEl);
    }
    const emojiBtn = el("button", {
      class: "composer-icon-btn",
      title: "Эмодзи",
      html: iconSvg("Smile", 19),
      onclick: () => toggleEmoji(),
    });
    const emojiSlot = el("div", { class: "composer-attach-slot composer-secondary" }, [emojiBtn]);

    // Stickers are grouped into packs: the built-in set plus anything the user
    // assembled themselves (components/stickerPackDialog.js). Each one renders
    // as its own animated scene rather than a flat emoji, so the picker shows
    // exactly what will be sent.
    let myPacks = [];

    function sendSticker(s) {
      stickerMenuEl?.remove();
      stickerMenuEl = null;
      onSend("", [], { sticker: { emoji: s.emoji, name: s.name, anim: s.anim, scene: s.scene } });
    }

    function packSection(title, stickers) {
      return el("div", { class: "sticker-pack-section" }, [
        el("p", { class: "sticker-pack-heading" }, title),
        el(
          "div",
          { class: "sticker-pack-items" },
          stickers.map((s) =>
            el("button", { class: "sticker-picker-item", title: s.name || s.emoji, onclick: () => sendSticker(s) }, [
              renderScene(s.emoji, { size: 30, preferred: s.scene, replay: false }),
            ])
          )
        ),
      ]);
    }

    function renderStickerPicker() {
      clear(stickerMenuEl);
      stickerMenuEl.append(
        // Нарисованный набор первым: он и есть лицо приложения, а эмодзи —
        // запасной вариант на всё остальное.
        packSection("Shalter", DRAWN_STICKERS),
        packSection("Стандартные", STICKERS),
        ...myPacks.filter((p) => p.stickers.length).map((p) => packSection(p.name, p.stickers)),
        el("button", { class: "sticker-manage-btn", onclick: () => {
          stickerMenuEl?.remove();
          stickerMenuEl = null;
          openStickerPackDialog(() => {});
        } }, "Мои стикерпаки")
      );
    }

    // Sticker picker — sends immediately on tap (like Telegram), not
    // inserted into the text field, so it's its own message rather than
    // text-plus-emoji.
    let stickerMenuEl = null;
    function toggleStickers(host = stickerSlot) {
      if (stickerMenuEl) {
        stickerMenuEl.remove();
        stickerMenuEl = null;
        return;
      }
      stickerMenuEl = el("div", { class: `composer-emoji-picker sticker-picker ${host === attachSlot ? "anchored-left" : ""}` });
      renderStickerPicker();
      host.appendChild(stickerMenuEl);
      // Own packs load after the menu is already open, so the built-in set is
      // usable instantly and a slow request never blocks the picker.
      api
        .listStickerPacks()
        .then(({ packs }) => {
          myPacks = packs;
          if (stickerMenuEl) renderStickerPicker();
        })
        .catch(() => {});
    }
    const stickerBtn = el("button", {
      class: "composer-icon-btn",
      title: "Стикеры",
      html: iconSvg("Sticker", 19),
      onclick: () => toggleStickers(),
    });
    const stickerSlot = el("div", { class: "composer-attach-slot composer-secondary" }, [stickerBtn]);

    // "Send later" — queues whatever's currently typed instead of sending
    // now (server/lib/scheduledMessagesSweep.js fires it at the chosen
    // time). Doesn't apply while editing an existing message.
    function scheduleSend() {
      if (!textarea.value.trim()) {
        alert("Сначала напишите сообщение — запланировать можно только то, что уже набрано");
        return;
      }
      openScheduleSendDialog(async (sendAt) => {
        try {
          await api.scheduleMessage(chatId, { text: textarea.value.trim(), replyToId: replyingTo?.id ?? null, sendAt });
          textarea.value = "";
          autoResize();
          updateTrailingButtons();
          clearDraft();
          onScheduled?.();
        } catch (err) {
          alert(err.message || "Не удалось запланировать отправку");
        }
      });
    }
    const scheduleSlot = editingMessage
      ? null
      : el("div", { class: "composer-attach-slot composer-secondary" }, [
          el("button", {
            class: "composer-icon-btn",
            title: "Отправить позже",
            html: iconSvg("Clock", 18),
            onclick: scheduleSend,
          }),
        ]);

    // ── Hugo: proofreading the draft ────────────────────────────────────────
    // Explicitly triggered, never on typing: the draft is sent to a checking
    // service (see server/routes/hugo.js), and doing that silently on every
    // keystroke in a messenger would be the wrong default no matter how useful
    // the feature is.
    const hugoSlot = el("div", { class: "hugo-slot" });
    let hugoMatches = [];
    let hugoBusy = false;

    function closeHugo() {
      hugoMatches = [];
      clear(hugoSlot);
    }

    function setDraft(text, caret) {
      textarea.value = text;
      autoResize();
      updateTrailingButtons();
      textarea.focus();
      if (caret != null) textarea.setSelectionRange(caret, caret);
    }

    async function runHugo() {
      const text = textarea.value;
      if (!text.trim() || hugoBusy) return;
      hugoBusy = true;
      clear(hugoSlot);
      hugoSlot.appendChild(el("div", { class: "hugo-panel" }, [el("span", { class: "hugo-status" }, "Hugo проверяет текст…")]));
      try {
        const { matches } = await checkText(text);
        hugoMatches = matches;
        renderHugo();
      } catch (err) {
        clear(hugoSlot);
        hugoSlot.appendChild(
          el("div", { class: "hugo-panel hugo-panel-error" }, [
            el("span", { class: "hugo-status" }, err.message || "Не удалось проверить текст"),
            el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 14), onclick: closeHugo }),
          ])
        );
      } finally {
        hugoBusy = false;
      }
    }

    function renderHugo() {
      clear(hugoSlot);
      const text = textarea.value;

      if (hugoMatches.length === 0) {
        hugoSlot.appendChild(
          el("div", { class: "hugo-panel hugo-panel-clean" }, [
            el("span", { class: "hugo-status" }, "Ошибок не нашлось"),
            el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 14), onclick: closeHugo }),
          ])
        );
        return;
      }

      const list = el(
        "div",
        { class: "hugo-list" },
        hugoMatches.map((m) =>
          el("div", { class: `hugo-item hugo-${m.type}` }, [
            el("div", { class: "hugo-item-body" }, [
              el("p", { class: "hugo-item-head" }, [
                el("span", { class: "hugo-wrong" }, fragment(text, m) || "—"),
                m.replacements.length ? el("span", { class: "hugo-arrow" }, "→") : null,
                m.replacements.length ? el("span", { class: "hugo-right" }, m.replacements[0]) : null,
              ]),
              el("p", { class: "hugo-item-msg" }, m.message),
            ]),
            m.replacements.length
              ? el(
                  "div",
                  { class: "hugo-item-fixes" },
                  // The first suggestion gets the primary button; the rest are
                  // offered too, because a spell checker's top pick is regularly
                  // not the word you meant.
                  m.replacements.slice(0, 3).map((r, i) =>
                    el(
                      "button",
                      {
                        class: `hugo-fix-btn ${i === 0 ? "primary" : ""}`,
                        onclick: () => {
                          const res = applyFix(textarea.value, m, r);
                          setDraft(res.text, res.caret);
                          // Offsets after this one have shifted, so the rest of
                          // the list is stale — re-check rather than show wrong
                          // spans.
                          runHugo();
                        },
                      },
                      r
                    )
                  )
                )
              : null,
          ])
        )
      );

      const fixableCount = hugoMatches.filter((m) => m.replacements.length).length;
      hugoSlot.appendChild(
        el("div", { class: "hugo-panel" }, [
          el("div", { class: "hugo-panel-head" }, [
            el("span", { class: "hugo-status" }, `Hugo нашёл ${hugoMatches.length} ${plural(hugoMatches.length, "ошибку", "ошибки", "ошибок")}`),
            fixableCount > 1
              ? el(
                  "button",
                  {
                    class: "hugo-fix-all",
                    onclick: () => {
                      const res = applyAll(textarea.value, hugoMatches);
                      setDraft(res.text);
                      closeHugo();
                    },
                  },
                  "Исправить всё"
                )
              : null,
            el("button", { class: "icon-btn", title: "Закрыть", html: iconSvg("X", 14), onclick: closeHugo }),
          ]),
          list,
        ])
      );
    }

    const hugoBtn = el("button", {
      class: "composer-icon-btn",
      title: "Проверить текст (Hugo)",
      html: iconSvg("Check", 19),
      onclick: runHugo,
    });
    const hugoSlotBtn = el("div", { class: "composer-attach-slot composer-secondary" }, [hugoBtn]);

    const trailingSlot = el("div", { class: "composer-trailing" });
    function updateTrailingButtons() {
      clear(trailingSlot);
      if (textarea.value.trim()) {
        trailingSlot.appendChild(
          el("button", { class: "composer-send-btn", title: "Отправить", html: iconSvg("Send", 17), onclick: submit })
        );
        return;
      }
      if (!isRecordingSupported()) return;
      trailingSlot.append(
        el("button", {
          class: "composer-icon-btn",
          title: "Видео-сообщение",
          html: iconSvg("Video", 19),
          onclick: () => beginRecording("video-note"),
        }),
        el("button", {
          class: "composer-icon-btn",
          title: "Голосовое сообщение",
          html: iconSvg("Mic", 19),
          onclick: () => beginRecording("voice"),
        })
      );
    }

    // Скрепка, поле и вторичные кнопки — внутри одной «таблетки»; отправка и
    // запись остаются снаружи справа, как круглая кнопка в привычных
    // мессенджерах.
    const field = el("div", { class: "composer-field" }, [attachSlot, commandSlot, textarea, hugoSlotBtn, stickerSlot, scheduleSlot, emojiSlot].filter(Boolean));
    const row = el("div", { class: "composer-row" }, [mentionMenu, field, trailingSlot].filter(Boolean));
    bodySlot.append(uploadSlot, hugoSlot, row);
    updateTrailingButtons();

    queueMicrotask(() => {
      autoResize();
      if (replyingTo || editingMessage) textarea.focus();
    });
  }

  async function beginRecording(mode) {
    clear(bodySlot);
    const recordingBar = el("div", { class: "composer-recording-bar" });
    bodySlot.appendChild(recordingBar);

    // Панель записи собрана как в привычных мессенджерах: корзина слева,
    // живая волна по центру, время, пауза и отправка. Прежняя строка «Запись
    // голосового…» не сообщала ничего, кроме факта записи, — ни громкости, ни
    // возможности приостановиться.
    let videoPreview = null;
    let roundOverlay = null;
    if (mode === "video-note") {
      // Кружок висит по центру над чатом, а не сидит в панели ввода: он и есть
      // то, что записывают, — на него смотрят, пока говорят, и разглядеть себя
      // в кружке размером с кнопку невозможно. Панель внизу при этом остаётся
      // такой же, как у голосового.
      videoPreview = el("video", { autoplay: true, muted: true, playsinline: true, class: "composer-round-preview" });
      const flipOnPreview = el("button", {
        class: "composer-round-flip",
        title: "Другая камера",
        html: iconSvg("FlipCamera", 18),
        onclick: async () => {
          const res = await recordingHandle?.flipCamera?.();
          if (res?.error) showHint(res.error);
        },
      });
      roundOverlay = el("div", { class: "composer-round-overlay" }, [
        el("div", { class: "composer-round-wrap" }, [videoPreview, flipOnPreview]),
      ]);
      wrap.appendChild(roundOverlay);
    }

    const dot = el("span", { class: "composer-recording-dot" });
    // Волна: новая громкость приходит справа и сдвигает остальные влево.
    //
    // Число полосок считается от ширины, а не задано числом. С фиксированными
    // 34 полосками волна занимала свои полтораста пикселей, а дальше до самого
    // таймера тянулась пустота — на широком экране это выглядело сломанной
    // вёрсткой, чем и было.
    const waveEl = el("div", { class: "composer-wave" });
    let levels = [];
    function buildWave() {
      const width = waveEl.clientWidth || 260;
      // Потолок в 96 полосок был ошибкой: на широком мониторе волна шириной
      // 1592px рисовалась на 573px — заполнено 36%, остальное пустота. Число
      // считается только от ширины; верхняя граница оставлена лишь как защита
      // от абсурда, а не как рабочее ограничение.
      const count = Math.max(24, Math.min(400, Math.floor(width / 6)));
      if (count === levels.length) return;
      const old = levels;
      levels = new Array(count).fill(0.06);
      // Переносим уже накопленное, чтобы волна не обнулялась при повороте
      // экрана или изменении размера окна посреди записи.
      for (let i = 1; i <= Math.min(old.length, count); i++) levels[count - i] = old[old.length - i];
      clear(waveEl);
      waveEl.append(...levels.map(() => el("span", { class: "composer-wave-bar" })));
    }
    function drawWave() {
      const bars = waveEl.children;
      for (let i = 0; i < levels.length; i++) {
        // Минимум 14%, а не 8: полоска тишины должна читаться как полоска, а не
        // как точка, — иначе вся волна в паузах между словами превращается в
        // прерывистую линию.
        if (bars[i]) bars[i].style.height = `${Math.max(14, Math.round(levels[i] * 100))}%`;
      }
    }

    const timeLabel = el("span", { class: "mono composer-rec-time" }, "0:00,00");
    // Сотые доли идут не от onTick (он раз в секунду), а от собственного
    // отсчёта — и он останавливается на паузе, иначе после продолжения время
    // прыгнуло бы вперёд на всю длину паузы.
    let startedAt = Date.now();
    let pausedAt = null;
    function elapsedMs() {
      return (pausedAt ?? Date.now()) - startedAt;
    }
    function drawTime() {
      const ms = elapsedMs();
      const mm = Math.floor(ms / 60000);
      const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
      const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
      timeLabel.textContent = `${mm}:${ss},${cs}`;
    }
    const hint = el("span", { class: "composer-recording-hint composer-rec-hint" }, "");
    let hintTimer = null;
    function showHint(text) {
      hint.textContent = text;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => (hint.textContent = ""), 3000);
    }

    const pauseBtn = el("button", {
      class: "composer-icon-btn",
      title: "Пауза",
      html: iconSvg("Pause", 18),
      onclick: () => {
        if (!recordingHandle) return;
        const paused = recordingHandle.isPaused?.();
        const done = paused ? recordingHandle.resume?.() : recordingHandle.pause?.();
        if (!done) return;
        if (paused) {
          // Продолжаем: сдвигаем точку отсчёта на длину паузы.
          startedAt += Date.now() - (pausedAt ?? Date.now());
          pausedAt = null;
        } else {
          pausedAt = Date.now();
        }
        pauseBtn.innerHTML = "";
        pauseBtn.appendChild(el("span", { html: iconSvg(paused ? "Pause" : "Play", 18) }));
        pauseBtn.title = paused ? "Пауза" : "Продолжить";
        recordingBar.classList.toggle("paused", !paused);
      },
    });
    const cancelBtn = el("button", { class: "composer-icon-btn danger", title: "Удалить", html: iconSvg("Trash", 17), onclick: cancelRecording });
    const sendBtn = el("button", { class: "composer-round-send", title: "Отправить", html: iconSvg("Send", 17), onclick: finishRecording });
    recordingBar.append(...[cancelBtn, dot, waveEl, timeLabel, hint, pauseBtn, sendBtn].filter(Boolean));
    // Ширина известна только после вставки в документ.
    buildWave();
    drawWave();
    const onResize = () => {
      buildWave();
      drawWave();
    };
    window.addEventListener("resize", onResize);

    try {
      recordingHandle = await startRecording(mode, { onTick: () => drawTime() });
      startedAt = Date.now();
      if (videoPreview) videoPreview.srcObject = recordingHandle.stream;

      // Живая громкость. Без неё волна рисовалась бы случайными палочками — и
      // это видно сразу: она не совпадает с тем, что человек говорит.
      const meter = createLevelMeter(recordingHandle.stream);
      if (meter) {
        const step = () => {
          if (!recordingHandle) return;
          if (!recordingHandle.isPaused?.()) {
            levels.push(meter.level());
            levels.shift();
            drawWave();
            drawTime();
          }
          waveTimer = requestAnimationFrame(step);
        };
        waveTimer = requestAnimationFrame(step);
        levelMeter = meter;
      }
    } catch {
      stopWave();
      clear(bodySlot);
      bodySlot.appendChild(el("p", { class: "composer-record-error" }, "Нет доступа к микрофону или камере"));
      setTimeout(renderIdleBody, 1500);
      return;
    }

    recordingHandle.result.then(async (recorded) => {
      // Запись могла кончиться сама — по лимиту времени, — а не только по
      // кнопке: убирать кружок и гасить волну надо и в этом случае.
      stopWave();
      recordingHandle = null;
      renderIdleBody();
      if (!recorded) return;

      // Запись уходит обычной загрузкой файла, потоком на диск — как видео из
      // галереи. Раньше она ехала base64-строкой внутри самого сообщения: на
      // треть больше байт, и сообщение не появлялось, пока всё не уедет.
      const ext = (recorded.mimeType || "").includes("mp4") ? "mp4" : mode === "voice" ? "webm" : "webm";
      const file = new File([recorded.blob], `${mode}-${Date.now()}.${ext}`, { type: recorded.mimeType });
      try {
        const attachment = await uploadFile(file, mode);
        onSend("", [{ ...attachment, kind: mode, durationSec: recorded.durationSec }]);
      } catch (err) {
        alert(err.message || "Не удалось отправить запись");
      }
    });

    function stopWave() {
      window.removeEventListener("resize", onResize);
      roundOverlay?.remove();
      roundOverlay = null;
      if (waveTimer) cancelAnimationFrame(waveTimer);
      waveTimer = null;
      levelMeter?.close();
      levelMeter = null;
    }
    async function finishRecording() {
      stopWave();
      recordingHandle?.stop();
    }
    async function cancelRecording() {
      stopWave();
      recordingHandle?.cancel();
    }
  }

  return wrap;
}

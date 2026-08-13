import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { startRecording, isRecordingSupported, MAX_RECORD_SEC } from "../lib/recorder.js";
import { fileToImageDataUrl, fileToDataUrl } from "../lib/image.js";
import { openPollDialog } from "./pollDialog.js";
import { openContactPickerDialog } from "./contactPickerDialog.js";
import { openScheduleSendDialog } from "./scheduleSendDialog.js";
import { STICKERS } from "../lib/stickers.js";

const EMOJI = ["😀", "😂", "😍", "👍", "🙏", "🔥", "🎉", "😢", "😮", "❤️", "👏", "🤔"];
const TYPING_PING_MS = 2500; // well under the server's 4s typing-presence expiry
const DRAFT_SAVE_MS = 600; // debounce so we're not POSTing on every keystroke
const MAX_IMAGE_DIMENSION = 1600;

export function Composer({
  chatId,
  replyingTo,
  editingMessage,
  initialDraft,
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

    // Attach menu — each item sends a real attachment (no more "[Label]" text stub).
    const mediaFileInput = el("input", {
      type: "file",
      accept: "image/*,video/*",
      class: "hidden-input",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (file.type.startsWith("image/")) {
          const url = await fileToImageDataUrl(file, MAX_IMAGE_DIMENSION);
          onSend("", [{ kind: "image", name: file.name, mimeType: "image/jpeg", url }]);
        } else if (file.type.startsWith("video/")) {
          const url = await fileToDataUrl(file);
          onSend("", [{ kind: "video", name: file.name, size: file.size, mimeType: file.type, url }]);
        }
      },
    });
    const anyFileInput = el("input", {
      type: "file",
      class: "hidden-input",
      onchange: async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const url = await fileToDataUrl(file);
        onSend("", [{ kind: "file", name: file.name, size: file.size, mimeType: file.type, url }]);
      },
    });

    let attachMenuEl = null;
    function closeAttachMenu() {
      attachMenuEl?.remove();
      attachMenuEl = null;
    }
    const attachBtn = el("button", {
      class: "composer-icon-btn",
      title: "Вложение",
      html: iconSvg("Paperclip", 19),
      onclick: () => {
        if (attachMenuEl) return closeAttachMenu();
        attachMenuEl = el("div", { class: "composer-attach-menu" }, [
          el(
            "button",
            {
              class: "composer-attach-item",
              onclick: () => {
                closeAttachMenu();
                mediaFileInput.click();
              },
            },
            "Фото или видео"
          ),
          el(
            "button",
            {
              class: "composer-attach-item",
              onclick: () => {
                closeAttachMenu();
                anyFileInput.click();
              },
            },
            "Файл"
          ),
          el(
            "button",
            {
              class: "composer-attach-item",
              onclick: () => {
                closeAttachMenu();
                openPollDialog((question, options) => {
                  onSend(question, [
                    { kind: "poll", meta: { options, votes: options.map(() => 0), voterIds: options.map(() => []) } },
                  ]);
                });
              },
            },
            "Опрос"
          ),
          el("button", {
            class: "composer-attach-item",
            onclick: () => {
              closeAttachMenu();
              if (!navigator.geolocation) return alert("Геолокация не поддерживается в этом браузере");
              navigator.geolocation.getCurrentPosition(
                (pos) =>
                  onSend("", [{ kind: "location", meta: { lat: pos.coords.latitude, lng: pos.coords.longitude } }]),
                () => alert("Не удалось получить местоположение")
              );
            },
          }, "Геолокация"),
          el(
            "button",
            {
              class: "composer-attach-item",
              onclick: () => {
                closeAttachMenu();
                openContactPickerDialog((user) =>
                  onSend("", [{ kind: "contact", meta: { userId: user.id, name: user.name, phone: user.phone } }])
                );
              },
            },
            "Контакт"
          ),
        ]);
        attachSlot.appendChild(attachMenuEl);
      },
    });
    const attachSlot = el("div", { class: "composer-attach-slot" }, [attachBtn, mediaFileInput, anyFileInput]);

    // Emoji picker
    let emojiMenuEl = null;
    const emojiBtn = el("button", {
      class: "composer-icon-btn",
      title: "Эмодзи",
      html: iconSvg("Smile", 19),
      onclick: () => {
        if (emojiMenuEl) {
          emojiMenuEl.remove();
          emojiMenuEl = null;
          return;
        }
        emojiMenuEl = el(
          "div",
          { class: "composer-emoji-picker" },
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
        emojiSlot.appendChild(emojiMenuEl);
      },
    });
    const emojiSlot = el("div", { class: "composer-attach-slot" }, [emojiBtn]);

    // Sticker picker — sends immediately on tap (like Telegram), not
    // inserted into the text field, so it's its own message rather than
    // text-plus-emoji.
    let stickerMenuEl = null;
    const stickerBtn = el("button", {
      class: "composer-icon-btn",
      title: "Стикеры",
      html: iconSvg("Sticker", 19),
      onclick: () => {
        if (stickerMenuEl) {
          stickerMenuEl.remove();
          stickerMenuEl = null;
          return;
        }
        stickerMenuEl = el(
          "div",
          { class: "composer-emoji-picker sticker-picker" },
          STICKERS.map((s) =>
            el(
              "button",
              {
                class: "sticker-picker-item",
                title: s.name,
                onclick: () => {
                  stickerMenuEl.remove();
                  stickerMenuEl = null;
                  onSend("", [], { sticker: { emoji: s.emoji, name: s.name, anim: s.anim } });
                },
              },
              s.emoji
            )
          )
        );
        stickerSlot.appendChild(stickerMenuEl);
      },
    });
    const stickerSlot = el("div", { class: "composer-attach-slot" }, [stickerBtn]);

    // "Send later" — queues whatever's currently typed instead of sending
    // now (server/lib/scheduledMessagesSweep.js fires it at the chosen
    // time). Doesn't apply while editing an existing message.
    const scheduleSlot = editingMessage
      ? null
      : el("div", { class: "composer-attach-slot" }, [
          el("button", {
            class: "composer-icon-btn",
            title: "Отправить позже",
            html: iconSvg("Clock", 18),
            onclick: () => {
              if (!textarea.value.trim()) return;
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
            },
          }),
        ]);

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

    const row = el("div", { class: "composer-row" }, [mentionMenu, attachSlot, textarea, stickerSlot, scheduleSlot, emojiSlot, trailingSlot]);
    bodySlot.appendChild(row);
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

    let videoPreview = null;
    if (mode === "video-note") {
      videoPreview = el("video", { autoplay: true, muted: true, class: "composer-recording-preview" });
      recordingBar.appendChild(videoPreview);
    }
    const dot = el("span", { class: "composer-recording-dot" });
    const timeLabel = el("span", { class: "mono" }, `0s / ${MAX_RECORD_SEC}s`);
    const hint = el("span", { class: "composer-recording-hint" }, mode === "voice" ? "Запись голосового…" : "Запись видео-сообщения…");
    const flipBtn =
      mode === "video-note"
        ? el("button", {
            class: "composer-icon-btn",
            title: "Сменить камеру",
            html: iconSvg("FlipCamera", 16),
            onclick: () => recordingHandle?.flipCamera?.(),
          })
        : null;
    const cancelBtn = el("button", { class: "composer-icon-btn", html: iconSvg("X", 16), onclick: cancelRecording });
    const sendBtn = el("button", { class: "composer-recording-send", onclick: finishRecording }, "Отправить");
    recordingBar.append(...[dot, timeLabel, hint, flipBtn, cancelBtn, sendBtn].filter(Boolean));

    try {
      recordingHandle = await startRecording(mode, {
        onTick: (sec) => (timeLabel.textContent = `${sec}s / ${MAX_RECORD_SEC}s`),
      });
      if (videoPreview) videoPreview.srcObject = recordingHandle.stream;
    } catch {
      clear(bodySlot);
      bodySlot.appendChild(el("p", { class: "composer-record-error" }, "Нет доступа к микрофону или камере"));
      setTimeout(renderIdleBody, 1500);
      return;
    }

    recordingHandle.result.then((attachment) => {
      if (attachment) {
        onSend("", [{ kind: mode, ...attachment }]);
      }
      recordingHandle = null;
      renderIdleBody();
    });

    async function finishRecording() {
      recordingHandle?.stop();
    }
    async function cancelRecording() {
      recordingHandle?.cancel();
    }
  }

  return wrap;
}

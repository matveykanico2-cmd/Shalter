import { openMediaSendPopup } from "./mediaSendPopup.js";
import { askText } from "./confirmDialog.js";
import { el, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { getState } from "../state.js";
import { startRecording, isRecordingSupported, createLevelMeter, MAX_RECORD_SEC } from "../lib/recorder.js";
import { uploadFile } from "../lib/upload.js";
import { startChatAction, withChatAction, uploadActionFor } from "../lib/chatAction.js";
import { checkSize } from "../lib/uploadLimits.js";
import { openPollDialog } from "./pollDialog.js";
import { openChecklistDialog } from "./checklistDialog.js";
import { openDropdownMenu } from "./dropdownMenu.js";
import { openMemeDialog } from "./memeDialog.js";
import { openPaintDialog } from "./paintDialog.js";
import { openContactPickerDialog } from "./contactPickerDialog.js";
import { openScheduleSendDialog } from "./scheduleSendDialog.js";
import { STICKERS, DRAWN_STICKERS, renderSticker } from "../lib/stickers.js";
import { openStickerPackDialog } from "./stickerPackDialog.js";
import { EMOJI_GROUPS } from "../lib/emojiList.js";
import { checkText, applyFix, applyAll, fragment } from "../lib/hugo.js";
import { startLiveLocationSharing } from "../lib/liveLocation.js";
import { messagePreview } from "../lib/messagePreview.js";
import { previewText } from "../lib/formatText.js";
import { packWaveform } from "../lib/waveform.js";
import { startTranscription } from "../lib/speech.js";
import { parseSlashCommand, suggestSlashCommands } from "../lib/slashCommands.js";

const TYPING_PING_MS = 2500;
const DRAFT_SAVE_MS = 600;
const HOLD_MS = 250;
const HOLD_CANCEL_PX = 110;
const HOLD_LOCK_PX = 80;
const HOLD_MIN_MS = 400;

function fileKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
}

const MESSAGE_EFFECTS = ["🔥", "👍", "👎", "❤️", "🎉", "💩"];
const EFFECT_NAMES = { "🔥": "Огонь", "👍": "Класс", "👎": "Не нравится", "❤️": "Сердечки", "🎉": "Праздник", "💩": "Какашка" };

export function Composer({
  chatId,
  replyingTo,
  replyToName = "",
  editingMessage,
  initialDraft,
  botCommands = null,
  paidMessages = null,
  canPostAnonymously = false,
  members,
  onCancelReply,
  onCancelEdit,
  onSend,
  canSendWhileUploading = false,
  onSaveEdit,
  onDraftChange,
  onScheduled,
  onEditLast = null,
  disableDraftSync = false,
  topicId = null,
  allowEffects = false,
  allowWhenOnline = false,
}) {
  let lastTypingPing = 0;
  let staged = [];
  let renderStagedTray = () => {};
  let recordingHandle = null;
  let recordingStarting = false;
  let stopRecordAction = null;
  let waveTimer = null;
  let levelMeter = null;
  let activeHold = null;
  let draftSaveTimer = null;
  let postAsChat = false;

  function scheduleDraftSave(text) {
    if (disableDraftSync) return;
    onDraftChange?.(text);
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => api.setDraft(chatId, text).catch(() => {}), DRAFT_SAVE_MS);
  }
  function clearDraft() {
    if (disableDraftSync) return;
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
            el("span", { class: "composer-banner-label" }, editingMessage ? "Изменение" : replyToName ? `Ответ ${replyToName}` : "Ответ"),
            el("span", { class: "composer-banner-text" }, previewText(messagePreview(editingMessage ?? replyingTo)) || "Сообщение"),
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

    let draftEmoji = [];

    const textarea = el("textarea", {
      class: "composer-textarea",
      rows: 1,
      placeholder: paidMessages?.youPay ? `${paidMessages.kind === "comment" ? "Комментарий" : "Сообщение"} · ${paidMessages.stars} ⭐` : "Сообщение",
      value: editingMessage?.text ?? initialDraft ?? "",
    });

    const mentionMenu = el("div", { class: "composer-mention-menu hidden" });
    let mentionMatches = [];
    let mentionActiveIndex = 0;

    // Меню над полем: либо @упоминания, либо /команды.
    let menuMode = "mention";
    function currentCommandQuery() {
      if (editingMessage) return null;
      const pos = textarea.selectionStart;
      if (pos !== textarea.selectionEnd) return null;
      const m = textarea.value.slice(0, pos).match(/^\/([\p{L}\d_]*)$/u);
      return m ? m[1] : null;
    }
    function currentMentionQuery() {
      const before = textarea.value.slice(0, textarea.selectionStart);
      const m = before.match(/(?:^|\s)@(\w*)$/);
      return m ? m[1] : null;
    }
    function renderMentionMenu() {
      clear(mentionMenu);
      if (menuMode === "command") {
        mentionMatches.forEach((c, i) =>
          mentionMenu.appendChild(
            el(
              "button",
              {
                class: `composer-mention-item composer-command-item ${i === mentionActiveIndex ? "active" : ""}`,
                onmousedown: (e) => {
                  e.preventDefault();
                  selectMention(c);
                },
              },
              [
                el("span", { class: "composer-command-item-name mono" }, [`/${c.name}`, c.hint ? el("span", { class: "composer-command-item-hint" }, ` ${c.hint}`) : null]),
                el("span", { class: "composer-command-item-desc" }, c.bot ? c.description || "Команда бота" : c.description),
              ]
            )
          )
        );
        mentionMenu.querySelector(".active")?.scrollIntoView({ block: "nearest" });
        return;
      }
      mentionMatches.forEach((u, i) =>
        mentionMenu.appendChild(
          el(
            "button",
            {
              class: `composer-mention-item ${i === mentionActiveIndex ? "active" : ""}`,
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
      const commandQuery = currentCommandQuery();
      if (commandQuery !== null) {
        menuMode = "command";
        mentionMatches = suggestSlashCommands(commandQuery, botCommands ?? []);
        if (!mentionMatches.length) return closeMentionMenu();
        mentionActiveIndex = 0;
        renderMentionMenu();
        mentionMenu.classList.remove("hidden");
        return;
      }
      menuMode = "mention";
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
      if (menuMode === "command") {
        const cmd = user;
        closeMentionMenu();
        textarea.value = `/${cmd.name}${cmd.takesArg ? " " : ""}`;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        autoResize();
        updateTrailingButtons();
        // Команда без текста (кубик, опрос, команда бота) выполняется сразу.
        if (!cmd.takesArg) submit();
        return;
      }
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
      const full = textarea.scrollHeight;
      textarea.style.height = Math.min(full, 240) + "px";
      textarea.style.overflowY = full > 240 ? "auto" : "hidden";
    }

    function insertCustomEmoji(scene) {
      const idx = draftEmoji.length;
      draftEmoji.push(scene);
      const token = `[ce:${idx}]`;
      const pos = textarea.selectionStart ?? textarea.value.length;
      const before = textarea.value.slice(0, pos);
      const after = textarea.value.slice(pos);
      textarea.value = before + token + after;
      textarea.focus();
      const np = before.length + token.length;
      textarea.setSelectionRange(np, np);
      autoResize();
      updateTrailingButtons();
      if (!editingMessage) scheduleDraftSave(textarea.value);
    }

    function resetInput() {
      textarea.value = "";
      autoResize();
      updateTrailingButtons();
      clearDraft();
    }

    // «/команда …» — превращаем в разметку или выполняем действие.
    // Возвращает { text, silent } для отправки или null, если всё уже сделано.
    function applySlashCommand(text) {
      const reserved = (botCommands ?? []).map((c) => String(c.command ?? c.name ?? "").replace(/^\//, "").toLowerCase());
      const cmd = parseSlashCommand(text, { reserved });
      if (!cmd) return { text, silent: false };
      if (cmd.error) {
        closeMentionMenu();
        mentionMenu.append(el("p", { class: "composer-command-error" }, cmd.error));
        mentionMenu.classList.remove("hidden");
        setTimeout(() => {
          if (!mentionMatches.length) closeMentionMenu();
        }, 2500);
        return null;
      }
      if (cmd.dice) {
        onSend("", [{ kind: "dice", meta: { emoji: cmd.dice } }]);
        resetInput();
        return null;
      }
      if (cmd.action) {
        resetInput();
        const action = attachActions().find((a) => a.label === (cmd.action === "poll" ? "Опрос" : "Чек-лист"));
        action?.run();
        return null;
      }
      return cmd;
    }

    function submit(opts = {}) {
      let trimmed = textarea.value.trim();
      if (!trimmed && !staged.length) return;
      if (!editingMessage && trimmed.startsWith("/")) {
        const res = applySlashCommand(trimmed);
        if (!res) return;
        trimmed = res.text;
        if (res.silent) opts = { ...opts, silent: true };
      }
      const silent = {
        ...(opts.silent === true ? { silent: true } : {}),
        ...(opts.effect ? { effect: opts.effect } : {}),
      };
      if (editingMessage) {
        if (!trimmed) return;
        onSaveEdit(trimmed);
      } else if (staged.length) {
        const atts = staged.map((s) => s.attachment);
        staged = [];
        renderStagedTray();
        const extra = {
          ...silent,
          ...(postAsChat ? { anonymous: true } : {}),
          ...(draftEmoji.length ? { customEmoji: draftEmoji.slice() } : {}),
        };
        for (let i = 0; i < atts.length; i += MAX_ATTACHMENTS_PER_MESSAGE) {
          onSend(i === 0 ? trimmed : "", atts.slice(i, i + MAX_ATTACHMENTS_PER_MESSAGE), i === 0 ? extra : opts.silent === true ? { silent: true } : {});
        }
        draftEmoji = [];
        clearDraft();
      } else {
        onSend(trimmed, [], {
          ...silent,
          ...(postAsChat ? { anonymous: true } : {}),
          ...(draftEmoji.length ? { customEmoji: draftEmoji.slice() } : {}),
        });
        draftEmoji = [];
        clearDraft();
      }
      textarea.value = "";
      autoResize();
      updateTrailingButtons();
      if (postAsChat) {
        postAsChat = false;
        updateAnonymousToggle();
      }
    }

    textarea.addEventListener("input", () => {
      autoResize();
      updateTrailingButtons();
      if (!editingMessage && textarea.value.trim() && Date.now() - lastTypingPing > TYPING_PING_MS) {
        lastTypingPing = Date.now();
        api.sendTyping(chatId, "typing").catch(() => {});
      }
      if (!editingMessage) scheduleDraftSave(textarea.value);
      updateMentionMenu();
    });
    function wrapSelection(mark) {
      const { selectionStart: a, selectionEnd: b, value } = textarea;
      const inner = value.slice(a, b);
      const block = mark === "```";
      const open = block ? "```\n" : mark;
      const close = block ? "\n```" : mark;
      if (inner.startsWith(open) && inner.endsWith(close) && inner.length >= open.length + close.length) {
        textarea.setRangeText(inner.slice(open.length, inner.length - close.length), a, b, "select");
      } else {
        textarea.setRangeText(open + inner + close, a, b, "end");
        if (a === b) textarea.setSelectionRange(a + open.length, a + open.length);
      }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Панель форматирования, как в Telegram: появляется над полем, когда
    // выделен текст. Кнопки оборачивают выделение той же разметкой, что и
    // сочетания клавиш ниже (formatText.js её и отображает).
    function quoteSelection() {
      const { selectionStart: a, selectionEnd: b, value } = textarea;
      const inner = value.slice(a, b);
      const lines = inner.split("\n");
      const quoted = lines.every((l) => l.startsWith("> ")) ? lines.map((l) => l.slice(2)) : lines.map((l) => `> ${l}`);
      textarea.setRangeText(quoted.join("\n"), a, b, "select");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    async function linkSelection() {
      const { selectionStart: a, selectionEnd: b, value } = textarea;
      const label = value.slice(a, b).replace(/[\[\]\n]/g, " ").trim();
      if (!label) return;
      let url = (await askText("Адрес ссылки", "https://"))?.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      textarea.setRangeText(`[${label}](${url.replace(/[\s)]/g, "")})`, a, b, "end");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
    }
    const FORMAT_ACTIONS = [
      ["Ж", "Жирный (Ctrl+B)", () => wrapSelection("**"), "bold"],
      ["К", "Курсив (Ctrl+I)", () => wrapSelection("*"), "italic"],
      ["Ч", "Подчёркнутый (Ctrl+U)", () => wrapSelection("__"), "underline"],
      ["З", "Зачёркнутый (Ctrl+Shift+X)", () => wrapSelection("~~"), "strike"],
      ["</>", "Моноширинный (Ctrl+Shift+M)", () => wrapSelection("`"), "mono"],
      ["▒", "Спойлер (Ctrl+Shift+P)", () => wrapSelection("||"), "spoiler"],
      ["❝", "Цитата", quoteSelection, "quote"],
      ["🔗", "Ссылка", linkSelection, "link"],
    ];
    const formatBar = editingMessage
      ? null
      : el(
          "div",
          { class: "composer-format-bar", hidden: true },
          FORMAT_ACTIONS.map(([label, title, run, kind]) =>
            el(
              "button",
              {
                type: "button",
                class: `composer-format-btn format-${kind}`,
                title,
                // mousedown + preventDefault — чтобы поле не теряло выделение.
                onmousedown: (e) => e.preventDefault(),
                onclick: () => {
                  run();
                  updateFormatBar();
                },
              },
              label
            )
          )
        );
    function updateFormatBar() {
      if (!formatBar) return;
      const selected = document.activeElement === textarea && textarea.selectionEnd > textarea.selectionStart;
      formatBar.hidden = !selected;
    }
    if (formatBar) {
      document.addEventListener("selectionchange", function onSel() {
        if (!textarea.isConnected) return document.removeEventListener("selectionchange", onSel);
        updateFormatBar();
      });
      textarea.addEventListener("blur", () => setTimeout(updateFormatBar, 0));
    }

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
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        // Сочетания как в Telegram Desktop: оборачивают выделенный текст разметкой.
        const code = e.code;
        const wrap = e.shiftKey
          ? { KeyX: "~~", KeyM: "`", KeyP: "||", KeyK: "```" }[code]
          : { KeyB: "**", KeyI: "*", KeyU: "__" }[code];
        if (wrap) {
          e.preventDefault();
          wrapSelection(wrap);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === "Escape" && (replyingTo || editingMessage)) {
        e.preventDefault();
        e.stopPropagation();
        if (editingMessage) onCancelEdit();
        else onCancelReply();
        return;
      }
      if (e.key === "ArrowUp" && onEditLast && !editingMessage && !textarea.value && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onEditLast();
      }
    });
    textarea.addEventListener("paste", (e) => {
      if (editingMessage) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      pickToSend(files.map((file) => ({ file, kind: fileKind(file) })));
    });
    textarea.addEventListener("blur", () => closeMentionMenu());

    const uploadSlot = el("div", { class: "composer-upload-slot" });

    function showUploadError(message) {
      const row = el("div", { class: "composer-upload-row error" }, [
        el("span", { html: iconSvg("Info", 14) }),
        el("span", { class: "composer-upload-label" }, message),
        el("button", { class: "icon-btn", title: "Скрыть", html: iconSvg("X", 14), onclick: () => row.remove() }),
      ]);
      uploadSlot.appendChild(row);
    }

    const RING_R = 19;
    const RING_C = 2 * Math.PI * RING_R;
    function ringMarkup() {
      return `<svg class="composer-upload-ring" viewBox="0 0 44 44">
        <circle class="composer-upload-ring-track" cx="22" cy="22" r="${RING_R}"/>
        <circle class="composer-upload-ring-fill" cx="22" cy="22" r="${RING_R}"
          stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
      </svg>`;
    }

    function captureVideoFrame(file) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = el("video", { src: url, muted: true, playsInline: true, preload: "metadata" });
        const cleanup = () => URL.revokeObjectURL(url);
        const fail = () => {
          cleanup();
          resolve(null);
        };
        const timeout = setTimeout(fail, 4000);
        video.addEventListener("error", fail);
        video.addEventListener("loadeddata", () => {
          video.currentTime = Math.min(0.3, (video.duration || 0) / 2);
        });
        video.addEventListener("seeked", () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 1;
            canvas.height = video.videoHeight || 1;
            canvas.getContext("2d").drawImage(video, 0, 0);
            canvas.toBlob((blob) => {
              cleanup();
              resolve(blob ? URL.createObjectURL(blob) : null);
            });
          } catch {
            fail();
          }
        });
      });
    }

    const MAX_ATTACHMENTS_PER_MESSAGE = 10;

    wrap.attachDropped = editingMessage ? null : (files) => pickToSend(files.map((file) => ({ file, kind: fileKind(file) })));

    async function attachFiles(picks) {
      const items = [];
      for (const { file, kind } of picks) {
        const sizeError = checkSize(file, kind);
        if (sizeError) {
          showUploadError(sizeError);
          continue;
        }
        items.push({ file, kind });
      }
      if (!items.length) return;

      const strip = el("div", { class: "composer-upload-strip" });
      uploadSlot.appendChild(strip);

      const tiles = items.map(({ file, kind }) => {
        const ringHost = el("span", { class: "composer-upload-tile-ring", html: ringMarkup() });
        const fillCircle = ringHost.querySelector(".composer-upload-ring-fill");
        const preview = el("span", { class: "composer-upload-tile-preview" }, [
          el("span", { class: "composer-upload-tile-icon", html: iconSvg(kind === "video" ? "Video" : kind === "image" ? "Image" : "File", 20) }),
        ]);
        let xhr = null;
        const removeBtn = el("button", {
          class: "composer-upload-tile-remove",
          title: "Отменить",
          html: iconSvg("X", 12),
          onclick: () => {
            xhr?.abort();
            tile.remove();
          },
        });
        const tile = el("div", { class: "composer-upload-tile", title: file.name }, [preview, ringHost, removeBtn]);
        strip.appendChild(tile);
        return {
          file,
          kind,
          tile,
          setProgress(fraction) {
            fillCircle.style.strokeDashoffset = `${RING_C * (1 - fraction)}`;
          },
          setDone() {
            ringHost.classList.add("done");
          },
          setError() {
            ringHost.classList.add("error");
            removeBtn.remove();
          },
          setXhr: (x) => (xhr = x),
          setPreviewUrl(url) {
            if (!tile.isConnected || !url) return;
            preview.style.backgroundImage = `url("${url}")`;
            preview.classList.add("has-image");
          },
        };
      });

      for (const t of tiles) {
        if (t.kind === "image") t.setPreviewUrl(URL.createObjectURL(t.file));
        else if (t.kind === "video") captureVideoFrame(t.file).then((url) => t.setPreviewUrl(url));
      }

      const prepare = (t) => Promise.resolve(t.file);
      const stopUploadAction = startChatAction(chatId, uploadActionFor(tiles.map((t) => t.kind)));
      const results = await Promise.allSettled(
        tiles.map((t) =>
          prepare(t)
            .then((file) => {
              if (!t.tile.isConnected) throw new Error("Загрузка отменена");
              return uploadFile(
                file,
                t.kind,
                (fraction) => t.setProgress(fraction),
                (xhr) => t.setXhr(xhr)
              );
            })
            .then((attachment) => {
              t.setDone();
              return attachment;
            })
            .catch((err) => {
              t.setError();
              throw err;
            })
        )
      );

      stopUploadAction();
      strip.remove();

      const attachments = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      const failures = results.filter((r) => r.status === "rejected" && r.reason?.message !== "Загрузка отменена");
      const failedCount = failures.length;
      const reason = failures[0]?.reason?.message;

      results.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const a = r.value;
        const t = tiles[i];
        const previewUrl =
          a.thumbUrl || a.previewUrl || (t?.kind === "image" && t.file ? URL.createObjectURL(t.file) : "");
        staged.push({ attachment: a, kind: t?.kind ?? "file", previewUrl });
      });
      renderStagedTray();
      updateTrailingButtons();
      if (failedCount > 0) {
        showUploadError(
          !attachments.length
            ? reason || "Не удалось загрузить файл" + (results.length > 1 ? "ы" : "")
            : `Загружено ${attachments.length} из ${results.length} — часть файлов не отправилась${reason ? `: ${reason}` : ""}`
        );
      }
    }

    // Как в tweb: выбранные файлы сначала показываются в окне отправки с подписью.
    function pickToSend(picks) {
      if (!picks.length) return;
      openMediaSendPopup({
        picks,
        caption: textarea.value,
        onSend: async ({ picks: chosen, caption }) => {
          textarea.value = caption;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          await attachFiles(chosen);
          if (staged.length) submit();
        },
      });
    }

    function sendImageNow(file) {
      if (!canSendWhileUploading) return attachFiles([{ file, kind: "image" }]);
      const sizeError = checkSize(file, "image");
      if (sizeError) return showUploadError(sizeError);
      const local = { kind: "image", url: URL.createObjectURL(file), name: file.name, size: file.size, mimeType: file.type };
      onSend("", [local], { uploading: withChatAction(chatId, "upload_photo", uploadFile(file, "image")).then((a) => [a]) });
    }

    const mediaFileInput = el("input", {
      type: "file",
      accept: "image/*,video/*",
      multiple: true,
      class: "hidden-input",
      onchange: (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        pickToSend(
          files.map((file) => ({
            file,
            kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file",
          }))
        );
      },
    });
    const anyFileInput = el("input", {
      type: "file",
      multiple: true,
      class: "hidden-input",
      onchange: (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        pickToSend(files.map((file) => ({ file, kind: "file" })));
      },
    });
    // accept="audio/*" makes the phone open its music / audio files picker
    // rather than the gallery; the track goes out as a file with a player.
    const audioFileInput = el("input", {
      type: "file",
      accept: "audio/*",
      multiple: true,
      class: "hidden-input",
      onchange: (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        pickToSend(files.map((file) => ({ file, kind: "file" })));
      },
    });
    const cameraPhotoInput = el("input", {
      type: "file",
      accept: "image/*",
      capture: "environment",
      class: "hidden-input",
      onchange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) pickToSend([{ file: f, kind: "image" }]);
      },
    });
    const cameraVideoInput = el("input", {
      type: "file",
      accept: "video/*",
      capture: "environment",
      class: "hidden-input",
      onchange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) pickToSend([{ file: f, kind: "video" }]);
      },
    });

    let attachMenuEl = null;
    function closeAttachMenu() {
      attachMenuEl?.remove();
      attachMenuEl = null;
    }
    function attachActions() {
      // В личном чате нельзя отправить собеседнику его же собственный контакт
      // (tweb: контакт, который уже открыт в диалоге, не предлагается).
      const chat = getState().chats?.find((c) => c.id === chatId);
      const dmPeerId = chat?.type === "dm" ? chat.otherUser?.id ?? null : null;
      return [
        { icon: "Image", label: "Фото или видео", run: () => mediaFileInput.click() },
        { icon: "Video", label: "Снять фото", run: () => cameraPhotoInput.click() },
        { icon: "Video", label: "Снять видео", run: () => cameraVideoInput.click() },
        { icon: "File", label: "Файл", run: () => anyFileInput.click() },
        { icon: "Mic", label: "Аудио", run: () => audioFileInput.click() },
        { icon: "Sticker", label: "Стикер", run: () => toggleStickers(attachSlot) },
        { icon: "Smile", label: "Эмодзи", run: () => toggleEmoji(attachSlot) },
        {
          icon: "Zap",
          label: "Мем",
          run: () => openMemeDialog(sendImageNow),
        },
        {
          icon: "Edit",
          label: "Рисунок",
          run: () => openPaintDialog(sendImageNow),
        },
        {
          icon: "BarChart",
          label: "Опрос",
          run: () =>
            openPollDialog((question, options, { correctIndex, multiple } = {}) => {
              onSend(question, [
                {
                  kind: "poll",
                  meta: {
                    options,
                    votes: options.map(() => 0),
                    voterIds: options.map(() => []),
                    correctIndex: correctIndex ?? null,
                    multiple: !!multiple,
                  },
                },
              ]);
            }),
        },
        {
          icon: "CheckCheck",
          label: "Чек-лист",
          run: () =>
            openChecklistDialog((title, items, opts) => {
              onSend(title, [{ kind: "checklist", meta: { items: items.map((text, i) => ({ id: i + 1, text })), ...opts } }]);
            }),
        },
        {
          icon: "Smile",
          label: "Кубик и игры",
          run: () => {
            const r = attachBtn.getBoundingClientRect();
            const games = [["🎲", "Кубик"], ["🎯", "Дартс"], ["🏀", "Баскетбол"], ["⚽", "Футбол"], ["🎳", "Боулинг"], ["🎰", "Слот-машина"]];
            setTimeout(() => openDropdownMenu({ x: r.left, y: r.top - 8 }, games.map(([emoji, label]) => ({
              label: `${emoji}  ${label}`,
              onClick: () => onSend("", [{ kind: "dice", meta: { emoji } }]),
            }))), 0);
          },
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
          icon: "MapPin",
          label: "Живая геолокация (15 мин)",
          run: () => {
            if (!navigator.geolocation) return alert("Геолокация не поддерживается в этом браузере");
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                const liveMinutes = 15;
                const message = await onSend("", [
                  { kind: "location", meta: { lat: pos.coords.latitude, lng: pos.coords.longitude, liveMinutes } },
                ]);
                if (message) startLiveLocationSharing(chatId, message.id, liveMinutes * 60_000);
              },
              () => alert("Не удалось получить местоположение")
            );
          },
        },
        {
          icon: "Users",
          label: "Контакт",
          run: () =>
            openContactPickerDialog(
              (user) => onSend("", [{ kind: "contact", meta: { userId: user.id, name: user.name, phone: user.phone } }]),
              "Отправить контакт",
              { extra: members ?? [], exclude: [dmPeerId] }
            ),
        },
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
    const attachSlot = el("div", { class: "composer-attach-slot" }, [attachBtn, mediaFileInput, anyFileInput, audioFileInput, cameraPhotoInput, cameraVideoInput]);

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

    let anonymousToggleBtn = null;
    function updateAnonymousToggle() {
      anonymousToggleBtn?.classList.toggle("active", postAsChat);
      if (anonymousToggleBtn) anonymousToggleBtn.title = postAsChat ? "Отправляется от имени группы" : "Отправить от имени группы";
    }
    if (canPostAnonymously) {
      anonymousToggleBtn = el("button", {
        class: "composer-icon-btn",
        title: "Отправить от имени группы",
        html: iconSvg("Users", 18),
        onclick: () => {
          postAsChat = !postAsChat;
          updateAnonymousToggle();
        },
      });
    }

    let emojiMenuEl = null;
    function insertPlainEmoji(e) {
      const pos = textarea.selectionStart ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, pos) + e + textarea.value.slice(pos);
      // На телефоне не открываем клавиатуру поверх панели эмодзи — как в tweb.
      if (!window.matchMedia?.("(pointer: coarse)").matches) textarea.focus();
      textarea.setSelectionRange(pos + e.length, pos + e.length);
      // Как при наборе: размер поля, кнопка «Отправить» вместо микрофона, черновик, «печатает…».
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Панель эмодзи как в tweb (emoticonsDropdown/tabs/emoji): «Недавние» и семь категорий
    // набора tweb, внизу — вкладки для быстрого перехода к разделу.
    const RECENT_KEY = "shalter.recentEmoji";
    const CATEGORY_ICONS = ["😀", "🐻", "🍔", "🚗", "⚽", "💡", "🏁"];
    function readRecent() {
      try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        return Array.isArray(list) ? list.slice(0, 32) : [];
      } catch {
        return [];
      }
    }
    function pickEmoji(e) {
      insertPlainEmoji(e);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 32)));
      } catch {}
    }
    function renderEmojiMenu() {
      if (!emojiMenuEl) return;
      clear(emojiMenuEl);
      const recent = readRecent();
      const sections = [
        ...(recent.length ? [{ name: "Недавние", emojis: recent, icon: null }] : []),
        ...EMOJI_GROUPS.map((g, i) => ({ ...g, icon: CATEGORY_ICONS[i] })),
      ];
      const scroller = el("div", { class: "tw-emoji-scroll" });
      const tabs = el("div", { class: "tw-emoji-tabs" });
      const sectionEls = sections.map((g) =>
        el("div", { class: "tw-emoji-section" }, [
          el("p", { class: "tw-emoji-title" }, g.name),
          el(
            "div",
            { class: "tw-emoji-grid" },
            g.emojis.map((e) => el("button", { type: "button", class: "tw-emoji-btn", onclick: () => pickEmoji(e) }, e))
          ),
        ])
      );
      scroller.append(...sectionEls);
      const tabBtns = sections.map((g, i) =>
        el(
          "button",
          {
            type: "button",
            class: "tw-emoji-tab",
            title: g.name,
            onclick: () => scroller.scrollTo({ top: sectionEls[i].offsetTop - scroller.offsetTop, behavior: "smooth" }),
          },
          g.icon ? g.icon : [el("span", { html: iconSvg("Clock", 20) })]
        )
      );
      tabs.append(...tabBtns);
      const markActive = () => {
        const top = scroller.scrollTop + 8;
        let idx = 0;
        sectionEls.forEach((s, i) => {
          if (s.offsetTop - scroller.offsetTop <= top) idx = i;
        });
        tabBtns.forEach((b, i) => b.classList.toggle("active", i === idx));
      };
      scroller.addEventListener("scroll", markActive, { passive: true });
      emojiMenuEl.append(scroller, tabs);
      markActive();
    }

    function toggleEmoji(host = emojiSlot) {
      if (emojiMenuEl) {
        emojiMenuEl.remove();
        emojiMenuEl = null;
        return;
      }
      emojiMenuEl = el("div", { class: `composer-emoji-picker tw-emoji-panel ${host === attachSlot ? "anchored-left" : ""}` });
      host.appendChild(emojiMenuEl);
      renderEmojiMenu();
    }
    const emojiBtn = el("button", {
      class: "composer-icon-btn",
      title: "Эмодзи",
      html: iconSvg("Smile", 19),
      onclick: () => toggleEmoji(),
    });
    const emojiSlot = el("div", { class: "composer-attach-slot composer-secondary" }, [emojiBtn]);

    let myPacks = [];

    function sendSticker(s) {
      closeStickerMenu();
      onSend("", [], {
        sticker:
          s.kind === "image"
            ? { kind: "image", url: s.url, name: s.name, animated: s.animated }
            : s.kind === "custom"
              ? { kind: "custom", scene: s.scene, emoji: s.emoji, name: s.name }
              : { emoji: s.emoji, name: s.name, anim: s.anim, scene: s.scene },
      });
    }

    function packSection(title, stickers) {
      return el("div", { class: "sticker-pack-section" }, [
        el("p", { class: "sticker-pack-heading" }, title),
        el(
          "div",
          { class: "sticker-pack-items" },
          stickers.map((s) =>
            el(
              "button",
              { class: `sticker-picker-item ${s.kind === "image" ? "is-image" : ""}`, title: s.name || s.emoji || "Стикер", onclick: () => sendSticker(s) },
              [renderSticker(s, { size: s.kind === "image" ? 56 : 30 })]
            )
          )
        ),
      ]);
    }

    function renderStickerPicker() {
      clear(stickerMenuEl);
      stickerMenuEl.append(
        packSection("Shalter", DRAWN_STICKERS),
        packSection("Стандартные", STICKERS),
        ...myPacks.filter((p) => p.stickers.length).map((p) => packSection(p.name, p.stickers)),
        el("button", { class: "sticker-manage-btn", onclick: () => {
          closeStickerMenu();
          openStickerPackDialog(() => {});
        } }, "Мои стикерпаки")
      );
    }

    let stickerMenuEl = null;
    let stopStickerAction = null;
    function closeStickerMenu() {
      stickerMenuEl?.remove();
      stickerMenuEl = null;
      stopStickerAction?.();
      stopStickerAction = null;
    }
    function toggleStickers(host = stickerSlot) {
      if (stickerMenuEl) {
        closeStickerMenu();
        return;
      }
      stickerMenuEl = el("div", { class: `composer-emoji-picker sticker-picker ${host === attachSlot ? "anchored-left" : ""}` });
      renderStickerPicker();
      host.appendChild(stickerMenuEl);
      stopStickerAction = startChatAction(chatId, "choose_sticker", stickerMenuEl);
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

    function scheduleSend() {
      if (!textarea.value.trim()) {
        alert("Сначала напишите сообщение — запланировать можно только то, что уже набрано");
        return;
      }
      openScheduleSendDialog(async (sendAt, repeat, { whenOnline = false } = {}) => {
        try {
          await api.scheduleMessage(chatId, { text: textarea.value.trim(), replyToId: replyingTo?.id ?? null, sendAt, repeat, topicId, whenOnline });
          textarea.value = "";
          autoResize();
          updateTrailingButtons();
          clearDraft();
          onScheduled?.();
        } catch (err) {
          alert(err.message || "Не удалось запланировать отправку");
        }
      }, { allowWhenOnline });
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
                  m.replacements.slice(0, 3).map((r, i) =>
                    el(
                      "button",
                      {
                        class: `hugo-fix-btn ${i === 0 ? "primary" : ""}`,
                        onclick: () => {
                          const res = applyFix(textarea.value, m, r);
                          setDraft(res.text, res.caret);
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
      if (textarea.value.trim() || staged.length) {
        trailingSlot.appendChild(
          el("button", {
            class: "composer-send-btn",
            title: "Отправить (правый клик — другие варианты)",
            html: iconSvg("Send", 17),
            onclick: () => submit(),
            // Как в Telegram: долгое нажатие / правый клик — «без звука» и «позже».
            oncontextmenu: (e) => {
              e.preventDefault();
              if (editingMessage) return;
              const r = e.currentTarget.getBoundingClientRect();
              openDropdownMenu({ x: r.right - 220, y: r.top - 8 }, [
                { icon: "BellOff", label: "Отправить без звука", onClick: () => submit({ silent: true }) },
                { icon: "Clock", label: "Отправить позже", onClick: scheduleSend },
                ...(allowEffects
                  ? [{ icon: "Zap", label: "Отправить с эффектом", onClick: () => setTimeout(() => openDropdownMenu({ x: r.right - 220, y: r.top - 8 },
                      MESSAGE_EFFECTS.map((effect) => ({ label: `${effect}  ${EFFECT_NAMES[effect]}`, onClick: () => submit({ effect }) }))), 0) }]
                  : []),
              ]);
            },
          })
        );
        return;
      }
      if (!isRecordingSupported()) return;
      trailingSlot.append(
        makeRecordButton("video-note", "Video", "Видео-сообщение"),
        makeRecordButton("voice", "Mic", "Голосовое сообщение")
      );
    }

    const stagedTray = el("div", { class: "composer-staged-tray" });
    renderStagedTray = () => {
      clear(stagedTray);
      stagedTray.style.display = staged.length ? "" : "none";
      staged.forEach((s, idx) => {
        const item = el("div", { class: `composer-staged-item kind-${s.kind}` });
        if (s.previewUrl) {
          item.style.backgroundImage = `url("${s.previewUrl}")`;
          item.classList.add("has-image");
        } else {
          item.appendChild(el("span", { class: "composer-staged-icon", html: iconSvg(s.kind === "video" ? "Video" : s.kind === "image" ? "Image" : "File", 18) }));
        }
        if (s.kind === "video") item.appendChild(el("span", { class: "composer-staged-play", html: iconSvg("Play", 14) }));
        item.appendChild(
          el("button", {
            class: "composer-staged-remove",
            title: "Убрать",
            html: iconSvg("X", 12),
            onclick: () => {
              staged.splice(idx, 1);
              renderStagedTray();
              updateTrailingButtons();
            },
          })
        );
        stagedTray.appendChild(item);
      });
    };
    renderStagedTray();

    const field = el("div", { class: "composer-field" }, [attachSlot, commandSlot, anonymousToggleBtn, textarea, hugoSlotBtn, stickerSlot, scheduleSlot, emojiSlot].filter(Boolean));
    const row = el("div", { class: "composer-row" }, [mentionMenu, field, trailingSlot].filter(Boolean));
    const paidHint = paidMessages?.youPay
      ? el(
          "p",
          { class: "composer-paid-hint" },
          paidMessages.kind === "comment"
            ? `⭐ Комментарии в этом канале стоят ${paidMessages.stars} ⭐ — спишется за каждый`
            : `⭐ Этот пользователь принимает сообщения за ${paidMessages.stars} ⭐ — спишется за каждое отправленное`
        )
      : null;
    appendAll(bodySlot, paidHint, uploadSlot, hugoSlot, stagedTray, formatBar, row);
    updateTrailingButtons();

    queueMicrotask(() => {
      autoResize();
      if (replyingTo || editingMessage) textarea.focus();
    });
  }

  function makeRecordButton(mode, icon, title) {
    const btn = el("button", {
      class: "composer-icon-btn composer-record-btn",
      title: `${title}: нажмите — запись без рук, удерживайте — запись до отпускания`,
      html: iconSvg(icon, 19),
      onclick: () => {
        if (!activeHold && !recordingHandle) beginRecording(mode);
      },
      oncontextmenu: (e) => e.preventDefault(),
    });
    btn.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (activeHold || recordingHandle) return;
      e.preventDefault();
      const id = e.pointerId;
      const x0 = e.clientX;
      const y0 = e.clientY;
      try {
        btn.setPointerCapture(id);
      } catch {
      }
      let holdTimer = setTimeout(() => {
        holdTimer = null;
        beginRecording(mode, { hold: true });
      }, HOLD_MS);
      const noMenu = (ev) => ev.preventDefault();
      const seen = new WeakSet();
      const fresh = (ev) => {
        if (ev.pointerId !== id || seen.has(ev)) return false;
        seen.add(ev);
        return true;
      };
      const onMove = (ev) => {
        if (!fresh(ev)) return;
        activeHold?.move(ev.clientX - x0, ev.clientY - y0);
      };
      const finish = (ev, how) => {
        if (!fresh(ev)) return;
        for (const target of [window, btn]) {
          target.removeEventListener("pointermove", onMove);
          target.removeEventListener("pointerup", onUp);
          target.removeEventListener("pointercancel", onCancel);
        }
        window.removeEventListener("contextmenu", noMenu, true);
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
          return;
        }
        if (how === "up") suppressNextClick();
        if (how === "up") activeHold?.release();
        else activeHold?.lock();
      };
      const onUp = (ev) => finish(ev, "up");
      const onCancel = (ev) => finish(ev, "cancel");
      for (const target of [window, btn]) {
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
        target.addEventListener("pointercancel", onCancel);
      }
      window.addEventListener("contextmenu", noMenu, true);
    });
    return btn;
  }

  function suppressNextClick() {
    const stop = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 400);
  }

  async function beginRecording(mode, { hold = false } = {}) {
    if (recordingHandle || recordingStarting) return;
    recordingStarting = true;
    clear(bodySlot);
    const recordingBar = el("div", { class: "composer-recording-bar" });
    bodySlot.appendChild(recordingBar);
    let cancelledEarly = false;

    let videoPreview = null;
    let roundOverlay = null;
    if (mode === "video-note") {
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
    const waveEl = el("div", { class: "composer-wave" });
    let levels = [];
    // Все уровни за запись — из них собирается осциллограмма голосового.
    const recordedLevels = [];
    let transcription = null;
    function buildWave() {
      const width = waveEl.clientWidth || 260;
      const count = Math.max(24, Math.min(400, Math.floor(width / 6)));
      if (count === levels.length) return;
      const old = levels;
      levels = new Array(count).fill(0.06);
      for (let i = 1; i <= Math.min(old.length, count); i++) levels[count - i] = old[old.length - i];
      clear(waveEl);
      waveEl.append(...levels.map(() => el("span", { class: "composer-wave-bar" })));
    }
    function drawWave() {
      const bars = waveEl.children;
      for (let i = 0; i < levels.length; i++) {
        if (bars[i]) bars[i].style.height = `${Math.max(14, Math.round(levels[i] * 100))}%`;
      }
    }

    const timeLabel = el("span", { class: "mono composer-rec-time" }, "0:00,00");
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
    const slideHint = el("span", { class: "composer-rec-slide" }, "← Отмена");
    const lockHint = el("div", { class: "composer-rec-lock", title: "Потяните вверх, чтобы закрепить" }, [
      el("span", { html: iconSvg("Lock", 16) }),
      el("span", { class: "composer-rec-lock-arrow" }, "↑"),
    ]);
    recordingBar.append(...[cancelBtn, slideHint, dot, waveEl, timeLabel, hint, pauseBtn, sendBtn, hold ? lockHint : null].filter(Boolean));

    let holding = hold;
    const holdCtl = { move: moveHold, release: releaseHold, lock: lockHold };
    if (hold) {
      recordingBar.classList.add("holding");
      activeHold = holdCtl;
    }
    function endHold() {
      if (!holding) return;
      holding = false;
      if (activeHold === holdCtl) activeHold = null;
      recordingBar.classList.remove("holding");
      lockHint.remove();
    }
    function moveHold(dx, dy) {
      if (!holding) return;
      if (dx < -HOLD_CANCEL_PX) return cancelRecording();
      if (dy < -HOLD_LOCK_PX) return lockHold();
      const left = Math.min(0, dx);
      slideHint.style.transform = `translateX(${left}px)`;
      slideHint.style.opacity = String(1 - (0.7 * -left) / HOLD_CANCEL_PX);
      lockHint.style.transform = `translateY(${Math.min(0, dy)}px)`;
    }
    function lockHold() {
      if (!holding) return;
      endHold();
      showHint("Запись закреплена");
    }
    function releaseHold() {
      if (!holding) return;
      endHold();
      if (!recordingHandle || elapsedMs() < HOLD_MIN_MS) {
        showHint(recordingHandle ? "Слишком коротко — удерживайте дольше" : "");
        return;
      }
      finishRecording();
    }
    buildWave();
    drawWave();
    const onResize = () => {
      buildWave();
      drawWave();
    };
    window.addEventListener("resize", onResize);

    try {
      const handle = await startRecording(mode, { onTick: () => drawTime() });
      recordingStarting = false;
      if (cancelledEarly) {
        handle.cancel();
        return;
      }
      recordingHandle = handle;
      startedAt = Date.now();
      stopRecordAction = startChatAction(chatId, mode === "voice" ? "record_voice" : "record_video_note", recordingBar);
      if (videoPreview) videoPreview.srcObject = recordingHandle.previewStream ?? recordingHandle.stream;
      if (mode === "voice" && getState().settings?.voiceTranscription) {
        transcription = startTranscription();
      }

      const meter = createLevelMeter(recordingHandle.stream);
      if (meter) {
        const step = () => {
          if (!recordingHandle) return;
          if (!recordingHandle.isPaused?.()) {
            const level = meter.level();
            levels.push(level);
            levels.shift();
            if (mode === "voice") recordedLevels.push(level);
            drawWave();
            drawTime();
          }
          waveTimer = requestAnimationFrame(step);
        };
        waveTimer = requestAnimationFrame(step);
        levelMeter = meter;
      }
    } catch {
      recordingStarting = false;
      if (cancelledEarly) return;
      endHold();
      stopWave();
      clear(bodySlot);
      bodySlot.appendChild(el("p", { class: "composer-record-error" }, "Нет доступа к микрофону или камере"));
      setTimeout(renderIdleBody, 1500);
      return;
    }

    recordingHandle.result.then(async (recorded) => {
      stopWave();
      recordingHandle = null;
      stopRecordAction?.();
      stopRecordAction = null;
      renderIdleBody();
      if (!recorded) {
        transcription?.cancel();
        return;
      }

      const ext = (recorded.mimeType || "").includes("mp4") ? "mp4" : mode === "voice" ? "webm" : "webm";
      const file = new File([recorded.blob], `${mode}-${Date.now()}.${ext}`, { type: recorded.mimeType });
      try {
        const [attachment, transcript] = await Promise.all([
          withChatAction(chatId, mode === "voice" ? "upload_voice" : "upload_video_note", uploadFile(file, mode)),
          transcription?.stop() ?? "",
        ]);
        const extra = mode === "voice" ? { waveform: packWaveform(recordedLevels), transcript: transcript || undefined } : {};
        onSend("", [{ ...attachment, kind: mode, durationSec: recorded.durationSec, ...extra }]);
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
      if (!recordingHandle) return;
      endHold();
      stopWave();
      recordingHandle.stop();
    }
    async function cancelRecording() {
      endHold();
      stopWave();
      if (recordingHandle) return recordingHandle.cancel();
      cancelledEarly = true;
      renderIdleBody();
    }
  }

  return wrap;
}

import { el, clear, appendAll } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { api } from "../api.js";
import { startRecording, isRecordingSupported, createLevelMeter, MAX_RECORD_SEC } from "../lib/recorder.js";
import { uploadFile } from "../lib/upload.js";
import { startChatAction, withChatAction, uploadActionFor } from "../lib/chatAction.js";
import { checkSize } from "../lib/uploadLimits.js";
import { openPollDialog } from "./pollDialog.js";
import { openMemeDialog } from "./memeDialog.js";
import { openContactPickerDialog } from "./contactPickerDialog.js";
import { openScheduleSendDialog } from "./scheduleSendDialog.js";
import { STICKERS, DRAWN_STICKERS, renderSticker } from "../lib/stickers.js";
import { openStickerPackDialog } from "./stickerPackDialog.js";
import { openAnimatorEditor } from "./animatorEditor.js";
import { renderCustomScene } from "../lib/customScene.js";
import { checkText, applyFix, applyAll, fragment } from "../lib/hugo.js";
import { startLiveLocationSharing } from "../lib/liveLocation.js";

const EMOJI = ["😀", "😂", "😍", "👍", "🙏", "🔥", "🎉", "😢", "😮", "❤️", "👏", "🤔"];
const TYPING_PING_MS = 2500; // well under the server's 4s typing-presence expiry
const DRAFT_SAVE_MS = 600; // debounce so we're not POSTing on every keystroke

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
  // Плата за сообщение в этой переписке: { stars, youPay } с сервера
  // (server/lib/messagePrice.js). Цена известна до отправки, поэтому и сказать
  // о ней надо до отправки — раньше человек узнавал о плате только из отказа.
  paidMessages = null,
  canPostAnonymously = false,
  members,
  onCancelReply,
  onCancelEdit,
  onSend,
  // Хозяин поля (chatView.js) умеет показать сообщение сразу, а вложения
  // дождаться — см. sendImageNow ниже. Ветка обсуждения этого не умеет, там
  // картинка идёт прежним путём: загрузка, потом отправка.
  canSendWhileUploading = false,
  onSaveEdit,
  onDraftChange,
  onScheduled,
}) {
  let lastTypingPing = 0;
  let recordingHandle = null;
  let stopRecordAction = null;
  // Волна рисуется кадрами, а звук слушается через AudioContext — и то и другое
  // надо остановить, когда запись кончилась: иначе кадры продолжают крутиться,
  // а микрофонный контекст остаётся открытым.
  let waveTimer = null;
  let levelMeter = null;
  let draftSaveTimer = null;
  // "Отправить от имени группы" — сбрасывается после каждой отправки, как и
  // ответ/редактирование: это разовое решение на одно сообщение, не режим.
  let postAsChat = false;

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

    // Кастомные эмодзи, вставленные в текущий черновик: сцены, на которые
    // ссылаются токены [ce:N] в тексте (см. lib/customScene.js, formatText.js).
    // Уходят с сообщением как отдельный массив и обнуляются после отправки.
    let draftEmoji = [];

    const textarea = el("textarea", {
      class: "composer-textarea",
      rows: 1,
      placeholder: paidMessages?.youPay ? `${paidMessages.kind === "comment" ? "Комментарий" : "Сообщение"} · ${paidMessages.stars} ⭐` : "Сообщение",
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

    // Вставка кастомного эмодзи в текст на месте курсора: сцена кладётся в
    // draftEmoji, а в текст встаёт токен [ce:N] с её индексом.
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

    function submit() {
      const trimmed = textarea.value.trim();
      if (!trimmed) return;
      if (editingMessage) onSaveEdit(trimmed);
      else {
        onSend(trimmed, [], {
          ...(postAsChat ? { anonymous: true } : {}),
          // Черновик мог сослаться на эмодзи и потом стереть токен — неважно:
          // лишние сцены сервер отбросит по индексам, а токены рисуются из этого
          // массива по позиции.
          ...(draftEmoji.length ? { customEmoji: draftEmoji.slice() } : {}),
        });
        draftEmoji = [];
        clearDraft();
      }
      textarea.value = "";
      autoResize();
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
      // Appended, not clear(uploadSlot) — a rejected file (too big, say)
      // while an *earlier* batch is still uploading used to wipe that
      // batch's progress tiles off the screen along with the error, even
      // though the earlier upload itself kept running in the background
      // unaffected. The row removes only itself.
      const row = el("div", { class: "composer-upload-row error" }, [
        el("span", { html: iconSvg("Info", 14) }),
        el("span", { class: "composer-upload-label" }, message),
        el("button", { class: "icon-btn", title: "Скрыть", html: iconSvg("X", 14), onclick: () => row.remove() }),
      ]);
      uploadSlot.appendChild(row);
    }

    // A ring drawn as an SVG stroke-dashoffset — filled clockwise as the
    // upload's XHR progress event advances. Built as a markup string (same
    // style as icons.js) rather than through dom.js's el(), which only knows
    // document.createElement and can't build SVG nodes in the right namespace.
    const RING_R = 19;
    const RING_C = 2 * Math.PI * RING_R;
    function ringMarkup() {
      return `<svg class="composer-upload-ring" viewBox="0 0 44 44">
        <circle class="composer-upload-ring-track" cx="22" cy="22" r="${RING_R}"/>
        <circle class="composer-upload-ring-fill" cx="22" cy="22" r="${RING_R}"
          stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
      </svg>`;
    }

    // Best-effort poster frame for a video thumbnail — decodes just enough of
    // the file in an offscreen <video> to grab one frame, without waiting for
    // (or triggering) any real transcoding. Resolves null on anything that
    // isn't picture-in-picture-able fast (corrupt file, exotic codec — the
    // thumbnail just falls back to a plain icon then).
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
          // A frame at 0:00 is often a black flash before real content —
          // nudging in a bit (clamped to the clip's own length) gives a
          // thumbnail that actually looks like the video.
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

    // Uploads a batch of files (usually picked together — a multi-select from
    // the file dialog) in parallel, each shown as its own thumbnail tile with
    // a filling progress ring, then sends everything as ONE message once every
    // upload in the batch has settled — instead of the old one-request-per-file
    // flow, where files raced each other for the single shared progress row
    // and each landed as its own separate message the instant it finished
    // (out of order, and N round trips to the server instead of one).
    //
    // Files stream to the server as-is (server/routes/uploads.js) — nothing is
    // recompressed here, see the comment that used to sit on the old
    // single-file version of this function for why.
    //
    // MAX_ATTACHMENTS in server/lib/sanitizeAttachments.js caps one message at
    // 10 — chunking client-side means a 23-photo pick becomes 3 messages
    // instead of silently losing the 11th photo onward.
    const MAX_ATTACHMENTS_PER_MESSAGE = 10;

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

      // Appended alongside whatever's already in uploadSlot, not
      // clear()-ed first — attaching a second batch while an earlier one
      // is still uploading used to wipe the earlier batch's tiles from the
      // screen (the upload itself kept running regardless, just invisibly);
      // now each batch gets its own strip and only ever removes its own.
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

      // Thumbnails are cosmetic and shouldn't hold up starting the uploads —
      // fired off in parallel with them, not awaited first.
      for (const t of tiles) {
        if (t.kind === "image") t.setPreviewUrl(URL.createObjectURL(t.file));
        else if (t.kind === "video") captureVideoFrame(t.file).then((url) => t.setPreviewUrl(url));
      }

      // Сжатие фото отключено — отправляем файл как есть, без потери качества.
      const prepare = (t) => Promise.resolve(t.file);
      // Пока файлы уходят, собеседник видит «отправляет фото/видео/файл».
      const stopUploadAction = startChatAction(chatId, uploadActionFor(tiles.map((t) => t.kind)));
      const results = await Promise.allSettled(
        tiles.map((t) =>
          prepare(t)
            .then((file) => {
              // Плитку убрали, пока фото пережималось, — загружать нечего.
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
      // Отменённые самим человеком — не ошибка, о них не сообщаем.
      const failures = results.filter((r) => r.status === "rejected" && r.reason?.message !== "Загрузка отменена");
      const failedCount = failures.length;
      // Причина словами (lib/upload.js): «сервер недоступен», «слишком большой»,
      // «проверьте соединение» — по одному общему «не удалось» не понять, что
      // делать.
      const reason = failures[0]?.reason?.message;

      for (let i = 0; i < attachments.length; i += MAX_ATTACHMENTS_PER_MESSAGE) {
        onSend("", attachments.slice(i, i + MAX_ATTACHMENTS_PER_MESSAGE));
      }
      if (failedCount > 0) {
        showUploadError(
          !attachments.length
            ? reason || "Не удалось загрузить файл" + (results.length > 1 ? "ы" : "")
            : `Загружено ${attachments.length} из ${results.length} — часть файлов не отправилась${reason ? `: ${reason}` : ""}`
        );
      }
    }

    // Одна готовая картинка (мем) — сразу в переписку, загрузка в фоне.
    function sendImageNow(file) {
      if (!canSendWhileUploading) return attachFiles([{ file, kind: "image" }]);
      const sizeError = checkSize(file, "image");
      if (sizeError) return showUploadError(sizeError);
      const local = { kind: "image", url: URL.createObjectURL(file), name: file.name, size: file.size, mimeType: file.type };
      onSend("", [local], { uploading: withChatAction(chatId, "upload_photo", uploadFile(file, "image")).then((a) => [a]) });
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
        attachFiles(
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
        attachFiles(files.map((file) => ({ file, kind: "file" })));
      },
    });
    // Съёмка прямо с камеры: capture просит устройство открыть камеру, а не
    // галерею (на телефоне). На десктопе атрибут игнорируется — откроется
    // обычный выбор файла, так что кнопка работает везде.
    const cameraPhotoInput = el("input", {
      type: "file",
      accept: "image/*",
      capture: "environment",
      class: "hidden-input",
      onchange: (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) attachFiles([{ file: f, kind: "image" }]);
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
        if (f) attachFiles([{ file: f, kind: "video" }]);
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
        { icon: "Video", label: "Снять фото", run: () => cameraPhotoInput.click() },
        { icon: "Video", label: "Снять видео", run: () => cameraVideoInput.click() },
        { icon: "File", label: "Файл", run: () => anyFileInput.click() },
        { icon: "Sticker", label: "Стикер", run: () => toggleStickers(attachSlot) },
        { icon: "Smile", label: "Эмодзи", run: () => toggleEmoji(attachSlot) },
        {
          icon: "Zap",
          label: "Мем",
          run: () => openMemeDialog(sendImageNow),
        },
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
                // onSend может не вернуть сообщение (сеть подвела на самой
                // отправке) — тогда просто нечего было бы обновлять.
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
    const attachSlot = el("div", { class: "composer-attach-slot" }, [attachBtn, mediaFileInput, anyFileInput, cameraPhotoInput, cameraVideoInput]);

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

    // "Отправить от имени группы" — переключатель на одно сообщение, а не
    // режим (сбрасывается после submit(), см. выше). Сервер перепроверяет
    // право и настройку группы сам (routes/messages.js) — canPostAnonymously
    // здесь только решает, показывать ли вообще кнопку.
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

    // Emoji picker. Takes the element to hang off, because on a phone the icon
    // that normally opens it isn't on screen — it's in the paperclip menu, and
    // the picker has to anchor to the paperclip instead.
    let emojiMenuEl = null;
    let myEmoji = [];
    function insertPlainEmoji(e) {
      const pos = textarea.selectionStart ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, pos) + e + textarea.value.slice(pos);
      textarea.focus();
      textarea.setSelectionRange(pos + e.length, pos + e.length);
      autoResize();
      if (!editingMessage) scheduleDraftSave(textarea.value);
    }

    function renderEmojiMenu() {
      if (!emojiMenuEl) return;
      clear(emojiMenuEl);
      emojiMenuEl.append(
        el(
          "div",
          { class: "composer-emoji-row" },
          EMOJI.map((e) => el("button", { onclick: () => insertPlainEmoji(e) }, e))
        ),
        el("div", { class: "composer-emoji-heading" }, [
          el("span", {}, "Мои эмодзи"),
          // Нарисовать свой анимированный эмодзи в аниматоре (lib/customScene.js).
          el("button", {
            class: "composer-emoji-create",
            title: "Нарисовать эмодзи",
            onclick: () =>
              openAnimatorEditor({
                title: "Нарисовать эмодзи",
                saveLabel: "Сохранить эмодзи",
                onSave: async (scene) => {
                  try {
                    const { emoji } = await api.createCustomEmoji("", scene);
                    myEmoji = [emoji, ...myEmoji];
                    insertCustomEmoji(emoji.scene);
                    renderEmojiMenu();
                  } catch (err) {
                    alert(err.message || "Не удалось сохранить эмодзи");
                  }
                },
              }),
          }, "＋"),
        ]),
        myEmoji.length
          ? el(
              "div",
              { class: "composer-custom-emoji-row" },
              myEmoji.map((em) =>
                el("div", { class: "composer-custom-emoji-item" }, [
                  el(
                    "button",
                    { class: "composer-custom-emoji", title: em.name || "Эмодзи", onclick: () => insertCustomEmoji(em.scene) },
                    [renderCustomScene(em.scene, { size: 26 })]
                  ),
                  el("button", { class: "composer-custom-emoji-edit", title: "Изменить", onclick: () => editMyEmoji(em) }, "✎"),
                  el("button", { class: "composer-custom-emoji-del", title: "Удалить", onclick: () => deleteMyEmoji(em) }, "✕"),
                ])
              )
            )
          : el("p", { class: "composer-emoji-empty" }, "Нарисуйте свой первый анимированный эмодзи")
      );
    }

    // Переделать свой эмодзи в аниматоре.
    function editMyEmoji(em) {
      openAnimatorEditor({
        title: "Изменить эмодзи",
        saveLabel: "Сохранить",
        initial: em.scene,
        onSave: async (scene) => {
          try {
            const { emoji } = await api.updateCustomEmoji(em.id, { scene });
            myEmoji = myEmoji.map((e) => (e.id === emoji.id ? emoji : e));
            renderEmojiMenu();
          } catch (err) {
            alert(err.message || "Не удалось сохранить эмодзи");
          }
        },
      });
    }

    async function deleteMyEmoji(em) {
      try {
        await api.deleteCustomEmoji(em.id);
        myEmoji = myEmoji.filter((e) => e.id !== em.id);
        renderEmojiMenu();
      } catch (err) {
        alert(err.message || "Не удалось удалить эмодзи");
      }
    }

    function toggleEmoji(host = emojiSlot) {
      if (emojiMenuEl) {
        emojiMenuEl.remove();
        emojiMenuEl = null;
        return;
      }
      // Opened from the paperclip (the only way in on a phone) it hangs off
      // the left edge of the row, so it has to open rightwards or it lands
      // off the side of the screen.
      emojiMenuEl = el("div", { class: `composer-emoji-picker has-sections ${host === attachSlot ? "anchored-left" : ""}` });
      host.appendChild(emojiMenuEl);
      renderEmojiMenu();
      // Свои эмодзи подгружаются один раз при первом открытии.
      api
        .listCustomEmoji()
        .then(({ emoji }) => {
          myEmoji = emoji ?? [];
          renderEmojiMenu();
        })
        .catch(() => {});
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
              // Картинку показываем крупнее эмодзи: 30 точек хватает, чтобы узнать
              // смайлик, но не чтобы разглядеть своё фото.
              [renderSticker(s, { size: s.kind === "image" ? 56 : 30 })]
            )
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
          closeStickerMenu();
          openStickerPackDialog(() => {});
        } }, "Мои стикерпаки")
      );
    }

    // Sticker picker — sends immediately on tap (like Telegram), not
    // inserted into the text field, so it's its own message rather than
    // text-plus-emoji.
    let stickerMenuEl = null;
    // «Выбирает стикер», пока открыта панель, — как в Telegram.
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
    const field = el("div", { class: "composer-field" }, [attachSlot, commandSlot, anonymousToggleBtn, textarea, hugoSlotBtn, stickerSlot, scheduleSlot, emojiSlot].filter(Boolean));
    const row = el("div", { class: "composer-row" }, [mentionMenu, field, trailingSlot].filter(Boolean));
    // Плашка о платной переписке — над полем ввода, там же, где ответ и
    // изменение: это условие отправки, а не свойство собеседника.
    const paidHint = paidMessages?.youPay
      ? el(
          "p",
          { class: "composer-paid-hint" },
          paidMessages.kind === "comment"
            ? `⭐ Комментарии в этом канале стоят ${paidMessages.stars} ⭐ — спишется за каждый`
            : `⭐ Этот пользователь принимает сообщения за ${paidMessages.stars} ⭐ — спишется за каждое отправленное`
        )
      : null;
    appendAll(bodySlot, paidHint, uploadSlot, hugoSlot, row);
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
      // «Записывает голосовое» / «записывает кружок» — до конца записи,
      // отмены или остановки по лимиту времени (см. result ниже).
      stopRecordAction = startChatAction(chatId, mode === "voice" ? "record_voice" : "record_video_note", recordingBar);
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
      stopRecordAction?.();
      stopRecordAction = null;
      renderIdleBody();
      if (!recorded) return;

      // Запись уходит обычной загрузкой файла, потоком на диск — как видео из
      // галереи. Раньше она ехала base64-строкой внутри самого сообщения: на
      // треть больше байт, и сообщение не появлялось, пока всё не уедет.
      const ext = (recorded.mimeType || "").includes("mp4") ? "mp4" : mode === "voice" ? "webm" : "webm";
      const file = new File([recorded.blob], `${mode}-${Date.now()}.${ext}`, { type: recorded.mimeType });
      try {
        const attachment = await withChatAction(chatId, mode === "voice" ? "upload_voice" : "upload_video_note", uploadFile(file, mode));
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

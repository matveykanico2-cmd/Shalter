import { el, clear } from "../lib/dom.js";
import { iconSvg } from "../icons.js";
import { Avatar } from "./avatar.js";
import { formatText } from "../lib/formatText.js";
import { Composer } from "./composer.js";
import { api } from "../api.js";
import { onWsMessage } from "../lib/wsClient.js";
import { isChatAdmin, isChatModerator } from "../lib/chatRoles.js";
import { isServerModerator } from "../lib/moderation.js";

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// Real threads (group chats only, see chatView.js) — a nested
// sub-conversation on one root message, kept out of the main timeline
// entirely (server/data/messages.js's listMessages() excludes
// threadRootId rows) so this slide-in panel is the only place replies in
// it are readable. Reuses the profile-panel/info-panel shell (same
// right-docked slide-in look as ProfileDialog/InfoPanel) rather than
// introducing a third panel style.
// `source` подменяет две вещи — откуда брать ответы и куда отправлять новый.
// По умолчанию это ветка сообщения в группе; комментарии к посту канала
// (chatView.js) передают свой источник, потому что там всё то же самое, но
// поверх /api/posts/:id/comments: он сам находит группу обсуждения и сам
// вступает в неё за автора первого комментария. Панель от этого не меняется —
// корень, список ответов, поле ввода, — а второй такой же компонент рядом был
// бы копией с одной отличающейся строкой.
export function openThreadPanel({ chat, rootMessage, members, me, onReplySent, title = "Тема", emptyHint, source }) {
  let replies = [];
  const load = source?.load ?? (() => api.getThread(chat.id, rootMessage.id).then((r) => r.replies));
  const send = source?.send ?? ((text, attachments, extra) => api.sendMessage(chat.id, text, { threadRootId: rootMessage.id, attachments, ...extra }));

  const overlay = el("div", { class: "profile-panel-overlay", onclick: (e) => e.target === overlay && close() });
  const body = el("div", { class: "info-panel-body thread-panel-body" });
  const composerSlot = el("div", {});
  const panel = el("aside", { class: "profile-panel thread-panel" }, [
    el("div", { class: "info-panel-header" }, [
      el("h2", {}, title),
      el("button", { class: "icon-btn", html: iconSvg("X", 18), onclick: () => close() }),
    ]),
    body,
    composerSlot,
  ]);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const unsub = onWsMessage("thread:message", (msg) => {
    if (msg.chatId !== chat.id || msg.rootId !== rootMessage.id) return;
    replies = [...replies, msg.message];
    renderBody();
  });
  // Ответ поправили или удалили — у всех, у кого открыта эта ветка.
  const unsubUpdated = onWsMessage("message:updated", (msg) => {
    if (!msg.message || !replies.some((r) => r.id === msg.message.id)) return;
    replies = replies.map((r) => (r.id === msg.message.id ? msg.message : r));
    renderBody();
  });
  const unsubDeleted = onWsMessage("message:deleted", (msg) => {
    const id = msg.id ?? msg.messageId;
    if (!replies.some((r) => r.id === id)) return;
    replies = replies.filter((r) => r.id !== id);
    renderBody();
  });

  function close() {
    unsub();
    unsubUpdated();
    unsubDeleted();
    overlay.remove();
  }

  // Правка — только своего ответа, прямо в строке. Удалить — свой; чужой —
  // администрации чата (для комментариев — администрации канала, см.
  // server/routes/messages.js) и модератору сервера.
  let editingId = null;
  const canDeleteReply = (m) => m.senderId === me.id || isChatAdmin(chat, me.id) || isChatModerator(chat, me.id) || isServerModerator();

  async function saveReplyEdit(m, text) {
    const clean = text.trim();
    if (!clean || clean === m.text) {
      editingId = null;
      return renderBody();
    }
    try {
      const { message } = await api.editMessage(m.chatId, m.id, clean);
      replies = replies.map((r) => (r.id === m.id ? message : r));
      editingId = null;
      renderBody();
    } catch (err) {
      alert(err.message || "Не удалось сохранить");
    }
  }

  async function deleteReply(m) {
    if (!confirm(m.senderId === me.id ? "Удалить комментарий?" : `Удалить комментарий ${memberOf(m.senderId)?.name ?? "участника"}?`)) return;
    try {
      await api.deleteMessage(m.chatId, m.id, true);
      replies = replies.filter((r) => r.id !== m.id);
      renderBody();
      onReplySent?.();
    } catch (err) {
      alert(err.message || "Не удалось удалить");
    }
  }

  function memberOf(userId) {
    return members.find((u) => u.id === userId) ?? (userId === me.id ? me : undefined);
  }

  function personLine(userId) {
    const sender = memberOf(userId);
    return el("div", { class: "thread-reply-meta" }, [
      Avatar({ name: sender?.name ?? "?", color: sender?.avatarColor, image: sender?.avatarImage, size: 26 }),
      el("span", { class: "thread-reply-name" }, sender?.name ?? "Аноним"),
    ]);
  }

  function replyRow(m) {
    const own = m.senderId === me.id;
    if (editingId === m.id) {
      const input = el("textarea", { class: "settings-input thread-reply-edit", rows: 2, value: m.text });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          saveReplyEdit(m, input.value);
        }
        if (e.key === "Escape") {
          editingId = null;
          renderBody();
        }
      });
      setTimeout(() => input.focus(), 0);
      return el("div", { class: "thread-reply-row editing" }, [
        personLine(m.senderId),
        input,
        el("div", { class: "thread-reply-edit-actions" }, [
          el("button", { class: "settings-danger-link", onclick: () => ((editingId = null), renderBody()) }, "Отмена"),
          el("button", { class: "btn-accent", onclick: () => saveReplyEdit(m, input.value) }, "Сохранить"),
        ]),
      ]);
    }
    return el("div", { class: "thread-reply-row" }, [
      personLine(m.senderId),
      el("div", { class: "thread-reply-text message-text" }, formatText(m.text || "Медиа", members, m.customEmoji)),
      el("span", { class: "thread-reply-time" }, [timeLabel(m.createdAt), m.editedAt ? " · изм." : ""]),
      own || canDeleteReply(m)
        ? el("div", { class: "comment-actions thread-reply-actions" }, [
            own && m.text
              ? el("button", { class: "comment-action-btn", title: "Изменить", html: iconSvg("Edit", 14), onclick: () => ((editingId = m.id), renderBody()) })
              : null,
            canDeleteReply(m)
              ? el("button", { class: "comment-action-btn danger", title: "Удалить", html: iconSvg("Trash", 14), onclick: () => deleteReply(m) })
              : null,
          ])
        : null,
    ]);
  }

  function renderBody() {
    clear(body);
    body.append(
      el("div", { class: "thread-root" }, [personLine(rootMessage.senderId), el("div", { class: "message-text" }, formatText(rootMessage.text || "Медиа", members, rootMessage.customEmoji))]),
      el("p", { class: "list-section-label thread-replies-label" }, `${source?.repliesLabel ?? "Ответы"} (${replies.length})`),
      ...(replies.length ? replies.map(replyRow) : [el("p", { class: "empty-hint" }, emptyHint ?? "Пока нет ответов — начните тему первым")])
    );
    body.scrollTop = body.scrollHeight;
  }

  function renderComposer() {
    clear(composerSlot);
    composerSlot.appendChild(
      Composer({
        chatId: chat.id,
        members: members.filter((u) => u.id !== me.id),
        // Thread replies aren't cloud-drafted against the *chat's* draft
        // slot (composer.js's normal one) — that's the main composer's own
        // draft, and the two would otherwise stomp on each other.
        disableDraftSync: true,
        onSend: async (text, attachments, extra) => {
          await send(text, attachments, extra);
          // The sender's own reply doesn't come back over WS (see
          // routes/messages.js's broadcastToOtherMembers, which excludes
          // the actor) — refetch locally so it shows immediately instead of
          // waiting for someone else's next thread:message to trigger a
          // redraw. Same reason the *root's* bumped commentCount needs an
          // explicit nudge back to chatView.js's own message list — that
          // WS broadcast excludes the actor too, so without onReplySent the
          // "💬 N ответов" line under the root wouldn't update until the
          // next unrelated refresh.
          await refreshFromServer();
          onReplySent?.();
        },
      })
    );
  }

  async function refreshFromServer() {
    replies = await load();
    renderBody();
  }

  renderBody();
  renderComposer();
  refreshFromServer();
}

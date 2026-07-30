const { readCollection, updateCollection } = require("./store");

const FILE = "messages";

function listAllMessages() {
  return readCollection(FILE);
}

// viewerId + clearedBefore apply the per-viewer overlay: messages the viewer
// deleted "for themselves" (deletedForIds) or that predate their own
// "clear history for me" action (clearedBefore, from Settings.chatClears) are
// hidden from *this* viewer only — everyone else still sees them normally.
async function listMessages(chatId, viewerId, clearedBefore) {
  const all = await listAllMessages();
  return all
    .filter((m) => m.chatId === chatId)
    .filter((m) => !viewerId || !m.deletedForIds?.includes(viewerId))
    .filter((m) => !clearedBefore || m.createdAt > clearedBefore)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function getMessage(id) {
  const all = await listAllMessages();
  return all.find((m) => m.id === id);
}

async function addMessage(message) {
  await updateCollection(FILE, (all) => [...all, message]);
  return message;
}

async function deleteMessagesForChat(chatId) {
  await updateCollection(FILE, (all) => all.filter((m) => m.chatId !== chatId));
}

async function mutate(id, fn) {
  let updated;
  await updateCollection(FILE, (all) =>
    all.map((m) => {
      if (m.id !== id) return m;
      updated = fn(m);
      return updated;
    })
  );
  return updated;
}

function editMessage(id, text) {
  return mutate(id, (m) => ({ ...m, text, editedAt: new Date().toISOString() }));
}

// "Delete for everyone" — the message is gone, no tombstone left behind.
async function deleteMessage(id) {
  await updateCollection(FILE, (all) => all.filter((m) => m.id !== id));
}

// "Delete for me" — hidden from just this viewer; still fully visible to
// everyone else in the chat.
function deleteMessageForMe(id, userId) {
  return mutate(id, (m) => {
    const ids = new Set(m.deletedForIds ?? []);
    ids.add(userId);
    return { ...m, deletedForIds: [...ids] };
  });
}

function togglePin(id, pinned) {
  return mutate(id, (m) => ({ ...m, pinned }));
}

function toggleReaction(id, emoji, userId) {
  return mutate(id, (m) => {
    const reactions = m.reactions.map((r) => ({ ...r, userIds: [...r.userIds] }));
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (existing.userIds.includes(userId)) {
        existing.userIds = existing.userIds.filter((u) => u !== userId);
      } else {
        existing.userIds.push(userId);
      }
    } else {
      reactions.push({ emoji, userIds: [userId] });
    }
    return { ...m, reactions: reactions.filter((r) => r.userIds.length > 0) };
  });
}

function markRead(id, userId) {
  return mutate(id, (m) => (m.readByIds.includes(userId) ? m : { ...m, readByIds: [...m.readByIds, userId] }));
}

// Persisted poll voting — clicking your current option un-votes, clicking a
// different one moves your vote (only one choice per poll, like Telegram).
function votePoll(id, optionIndex, userId) {
  return mutate(id, (m) => {
    const attachments = m.attachments?.map((a) => {
      if (a.kind !== "poll") return a;
      const options = a.meta?.options ?? [];
      const voterIds = options.map((_, i) => [...(a.meta?.voterIds?.[i] ?? [])]);
      let votedSameAgain = false;
      for (let i = 0; i < voterIds.length; i++) {
        if (voterIds[i].includes(userId)) {
          if (i === optionIndex) votedSameAgain = true;
          voterIds[i] = voterIds[i].filter((v) => v !== userId);
        }
      }
      if (!votedSameAgain) voterIds[optionIndex].push(userId);
      return { ...a, meta: { ...a.meta, voterIds, votes: voterIds.map((v) => v.length) } };
    });
    return { ...m, attachments };
  });
}

// Increments the view counter on a channel post (see server/routes/posts.js).
function incrementViews(id) {
  return mutate(id, (m) => ({ ...m, views: (m.views ?? 0) + 1 }));
}

// Increments the comment counter on a channel post when a reply lands in the
// linked discussion chat (see server/routes/messages.js).
function incrementCommentCount(id) {
  return mutate(id, (m) => ({ ...m, commentCount: (m.commentCount ?? 0) + 1 }));
}

// Stamps the auto-forwarded copy of a post (in the linked discussion chat)
// with the post's own id, so a reply to that copy can be traced back to the
// post whose comment count it should increment (see server/routes/posts.js).
function setAnchorForPost(id, postId) {
  return mutate(id, (m) => ({ ...m, anchorForPostId: postId }));
}

// Stamps the post itself with the id of its auto-forwarded copy in the
// discussion chat, so the client can link "N comments" straight to it.
function setDiscussionAnchor(id, anchorId) {
  return mutate(id, (m) => ({ ...m, discussionAnchorId: anchorId }));
}

module.exports = {
  listAllMessages,
  listMessages,
  getMessage,
  addMessage,
  deleteMessagesForChat,
  editMessage,
  deleteMessage,
  deleteMessageForMe,
  togglePin,
  toggleReaction,
  markRead,
  votePoll,
  incrementViews,
  incrementCommentCount,
  setAnchorForPost,
  setDiscussionAnchor,
};

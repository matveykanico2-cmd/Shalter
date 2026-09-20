// Small helpers shared by every command group under server/lib/helperBot/.
const { getUser, findUserByUsername } = require("../../data/users");
const { getMessage } = require("../../data/messages");

function isOwner(chat, userId) {
  return chat?.ownerId === userId || (chat?.ownerIds ?? []).includes(userId);
}

function isOwnerOrAdmin(chat, userId) {
  return isOwner(chat, userId) || (chat?.adminIds ?? []).includes(userId);
}

function isStaff(chat, userId) {
  return isOwnerOrAdmin(chat, userId) || (chat?.moderatorIds ?? []).includes(userId);
}

// Telegram-style target resolution: a moderation command run as a reply acts
// on whoever sent the replied-to message; otherwise the first "@handle" (or
// bare username) in the command's own arguments.
async function resolveTarget(ctx) {
  if (ctx.message.replyToId) {
    const replied = await getMessage(ctx.message.replyToId);
    if (replied) {
      const user = await getUser(replied.senderId);
      if (user) return user;
    }
  }
  const token = ctx.argv[0];
  if (!token) return null;
  return findUserByUsername(token.replace(/^@/, ""));
}

// "10", "10m", "2h", "3d" → milliseconds. Bare number defaults to minutes,
// matching what someone typing "/mute 10" almost always means.
function parseDuration(input) {
  const m = String(input ?? "").trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || "m").toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

function formatUserRef(user) {
  if (!user) return "неизвестный пользователь";
  return user.username ? `${user.name} (@${user.username})` : user.name;
}

module.exports = { isOwner, isOwnerOrAdmin, isStaff, resolveTarget, parseDuration, formatUserRef };

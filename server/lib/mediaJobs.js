// Фоновая обработка вложений: превью фото и видео, длительность голосовых, перекодирование
// видео в историях. Маршруты только ставят задачу в очередь (backgroundJobs.js), а делает
// её фоновый процесс (server/worker.js): расшифровка, sharp и ffmpeg не занимают процесс,
// который отвечает на запросы, а задача, прерванная перезапуском, выполнится после него.
const fs = require("fs");
const { getMessage, setAttachmentPreview } = require("../data/messages");
const { getChat } = require("../data/chats");
const { getStoryById, updateStoryItem } = require("../data/stories");
const { FILENAME_RE } = require("./serveUpload");
const { generateVideoPreview, generateImagePreview, probeDuration } = require("./mediaPreview");
const { fetchUploadToTemp, storeGeneratedFile } = require("./uploadTransfer");
const { registerAttachments } = require("./uploadAccess");
const { audienceOf } = require("./storyAudience");
const { broadcastToUsers } = require("../ws");

const PREVIEWABLE_KINDS = new Set(["image", "video"]);

function uploadFilename(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return null;
  const filename = url.slice("/uploads/".length);
  return FILENAME_RE.test(filename) ? filename : null;
}

function needsPreview(attachment) {
  if (!PREVIEWABLE_KINDS.has(attachment?.kind) || !uploadFilename(attachment.url)) return false;
  return attachment.kind === "video" ? !attachment.previewUrl : !attachment.thumbUrl;
}

function markPendingPreviews(attachments) {
  return attachments?.map((a) =>
    needsPreview(a) ? { ...a, previewPending: true } : a
  );
}

async function buildPreview(attachment, filename) {
  const sourcePath = await fetchUploadToTemp(filename);
  try {
    if (attachment.kind === "image") {
      const previewPath = await generateImagePreview(sourcePath);
      try {
        const previewUrl = await storeGeneratedFile(previewPath);
        return { previewUrl, thumbUrl: previewUrl };
      } finally {
        await fs.promises.unlink(previewPath).catch(() => {});
      }
    }
    const { previewPath, posterPath, width, height, durationSec } = await generateVideoPreview(sourcePath);
    try {
      const previewUrl = await storeGeneratedFile(previewPath);
      const posterUrl = await storeGeneratedFile(posterPath);
      return { previewUrl, posterUrl, width, height, durationSec };
    } finally {
      await fs.promises.unlink(previewPath).catch(() => {});
      await fs.promises.unlink(posterPath).catch(() => {});
    }
  } finally {
    await fs.promises.unlink(sourcePath).catch(() => {});
  }
}

// Голосовые и кружки: точная длительность с сервера (у WebM из браузера её нет в файле,
// и до загрузки плеер показывал «0:00 / 0:00»). Записи из приложения присылают
// длительность сами — тогда только уточняем, если она пустая.
async function attachDurations(chat, message) {
  for (const [index, a] of (message.attachments ?? []).entries()) {
    if (!isTimed(a) || a.durationSec > 0) continue;
    const filename = uploadFilename(a.url);
    if (!filename) continue;
    let local = null;
    try {
      local = await fetchUploadToTemp(filename);
      const sec = await probeDuration(local);
      if (!(sec > 0)) continue;
      const updated = await setAttachmentPreview(message.id, index, { durationSec: Math.round(sec * 10) / 10 });
      if (updated) broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
    } catch (err) {
      console.warn(`duration probe failed for ${message.id}#${index}:`, err.message);
    } finally {
      if (local) fs.promises.unlink(local).catch(() => {});
    }
  }
}

async function attachPreviews(chat, message) {
  for (const [index, attachment] of (message.attachments ?? []).entries()) {
    const filename = needsPreview(attachment) ? uploadFilename(attachment.url) : null;
    if (!filename) continue;
    let preview = null;
    try {
      preview = await buildPreview(attachment, filename);
    } catch (err) {
      console.error(`preview generation failed for ${message.id}#${index}:`, err.message);
    }
    if (preview) registerAttachments(chat.id, [{ url: preview.previewUrl, thumbUrl: preview.posterUrl }]);
    const updated = await setAttachmentPreview(message.id, index, preview ?? {});
    if (updated) broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
  }
}

// Видео истории — как в сообщениях: перекодируем в H.264/AAC (1080p, звук 160 кбит/с,
// быстрый старт), чтобы оно открывалось везде (видео с iPhone в HEVC/MOV не играло
// на Android и в браузерах) и не грузилось часами в 4K. Пока идёт обработка — оригинал.
async function processStoryVideos(story) {
  for (const [index, item] of story.items.entries()) {
    // previewUrl уже есть — видео обработано до перезапуска, задача пришла повторно.
    if (item.kind !== "video" || item.previewUrl || !String(item.url).startsWith("/uploads/")) continue;
    let source = null;
    try {
      source = await fetchUploadToTemp(item.url.slice("/uploads/".length));
      const out = await generateVideoPreview(source, { height: 1080, crf: 21, audioBitrate: "160k", maxrate: "6000k" });
      try {
        const previewUrl = await storeGeneratedFile(out.previewPath);
        const posterUrl = await storeGeneratedFile(out.posterPath);
        updateStoryItem(story.id, index, { previewUrl, posterUrl, width: out.width, height: out.height, durationSec: out.durationSec });
        broadcastToUsers(await audienceOf(story.userId), { type: "story:updated", storyId: story.id, userId: story.userId });
      } finally {
        fs.promises.unlink(out.previewPath).catch(() => {});
        fs.promises.unlink(out.posterPath).catch(() => {});
      }
    } catch (err) {
      console.error(`story video processing failed for ${story.id}#${index}:`, err.message);
    } finally {
      if (source) fs.promises.unlink(source).catch(() => {});
    }
  }
}

function isTimed(a) {
  return a?.kind === "voice" || a?.kind === "video-note" || (a?.kind === "file" && /^audio\//.test(a.mimeType ?? ""));
}

// Есть ли у сообщения работа для фона — чтобы не ставить задачу на каждое сообщение.
function messageNeedsMedia(message) {
  return (message.attachments ?? []).some((a) => needsPreview(a) || (isTimed(a) && !(a.durationSec > 0) && uploadFilename(a.url)));
}

function storyNeedsMedia(story) {
  return story.items.some((item) => item.kind === "video" && !item.previewUrl && String(item.url).startsWith("/uploads/"));
}

const handlers = {
  async "message-media"({ messageId }) {
    const message = await getMessage(messageId);
    const chat = message && (await getChat(message.chatId));
    if (!chat) return;
    await attachPreviews(chat, message);
    await attachDurations(chat, message);
  },
  async "story-videos"({ storyId }) {
    const story = await getStoryById(storyId);
    if (story) await processStoryVideos(story);
  },
};

module.exports = { handlers, markPendingPreviews, messageNeedsMedia, storyNeedsMedia };

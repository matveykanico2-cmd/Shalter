import fs from "node:fs";
import { Injectable } from "@nestjs/common";
import { mediaPreview, uploadAccess, uploadTransfer, type Attachment } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { setAttachmentPreview } from "../messages/lib/message-edits.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import type { Message } from "../messages/model/domain.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import type { Story } from "../stories/model/domain.js";
import { StoriesRepository } from "../stories/stories.repository.js";
import { StoryAudienceService } from "../stories/story-audience.service.js";
import { isTimed, needsPlayback, needsPreview, uploadFilename } from "./lib/media-attachments.js";
import type { JobHandler } from "./model/domain.js";

const unlink = (file: string) => fs.promises.unlink(file).catch(() => {});

// Фоновая обработка вложений — то же, что server/lib/mediaJobs.js: превью фото и видео,
// длительность голосовых, перекодирование видео в историях. Расшифровка файла, sharp и
// ffmpeg остаются в server/ (uploadTransfer, mediaPreview).
@Injectable()
export class MediaJobsService {
  public constructor(
    private readonly messages: MessagesRepository,
    private readonly chats: ChatsRepository,
    private readonly stories: StoriesRepository,
    private readonly audience: StoryAudienceService,
    private readonly realtime: RealtimeService
  ) {}

  public handlers(): Record<string, JobHandler> {
    return {
      "message-media": async ({ messageId }) => {
        const message = this.messages.findById(messageId as string);
        const chat = message && this.chats.findById(message.chatId);
        if (!chat) return;
        await this.attachPreviews(chat, message);
        await this.attachDurations(chat, message);
        // Сообщение заново: длительность уже могла записаться.
        const fresh = this.messages.findById(message.id);
        if (fresh) await this.attachPlayback(chat, fresh);
      },
      "story-videos": async ({ storyId }) => {
        const story = this.stories.findById(storyId as string);
        if (story) await this.processStoryVideos(story);
      },
    };
  }

  private async buildPreview(attachment: Attachment, filename: string): Promise<Record<string, unknown>> {
    const transfer = uploadTransfer();
    const sourcePath = await transfer.fetchUploadToTemp(filename);
    try {
      if (attachment.kind === "image") {
        const previewPath = await mediaPreview().generateImagePreview(sourcePath);
        try {
          const previewUrl = await transfer.storeGeneratedFile(previewPath);
          return { previewUrl, thumbUrl: previewUrl };
        } finally {
          await unlink(previewPath);
        }
      }
      const { previewPath, posterPath, width, height, durationSec } = await mediaPreview().generateVideoPreview(sourcePath);
      try {
        const previewUrl = await transfer.storeGeneratedFile(previewPath);
        const posterUrl = await transfer.storeGeneratedFile(posterPath);
        return { previewUrl, posterUrl, width, height, durationSec };
      } finally {
        await unlink(previewPath);
        await unlink(posterPath);
      }
    } finally {
      await unlink(sourcePath);
    }
  }

  // Голосовые и кружки: точная длительность с сервера (у WebM из браузера её нет в файле,
  // и до загрузки плеер показывал «0:00 / 0:00»). Записи из приложения присылают
  // длительность сами — тогда только уточняем, если она пустая.
  private async attachDurations(chat: Chat, message: Message): Promise<void> {
    for (const [index, a] of (message.attachments ?? []).entries()) {
      if (!isTimed(a) || (a.durationSec as number) > 0) continue;
      const filename = uploadFilename(a.url);
      if (!filename) continue;
      let local: string | null = null;
      try {
        local = await uploadTransfer().fetchUploadToTemp(filename);
        const sec = await mediaPreview().probeDuration(local);
        if (!(sec! > 0)) continue;
        const updated = this.messages.mutate(message.id, setAttachmentPreview(index, { durationSec: Math.round(sec! * 10) / 10 }));
        if (updated) this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
      } catch (err) {
        console.warn(`duration probe failed for ${message.id}#${index}:`, (err as Error).message);
      } finally {
        if (local) void unlink(local);
      }
    }
  }

  // Голосовые и кружки из браузера (WebM) — копия, которую можно перематывать (needsPlayback).
  // Не вышло — остаётся оригинал, как было.
  private async attachPlayback(chat: Chat, message: Message): Promise<void> {
    for (const [index, a] of (message.attachments ?? []).entries()) {
      if (!needsPlayback(a)) continue;
      const filename = uploadFilename(a.url)!;
      let source: string | null = null;
      try {
        source = await uploadTransfer().fetchUploadToTemp(filename);
        const patch = await this.buildPlayback(a, source);
        uploadAccess().registerAttachments(chat.id, [{ url: patch.previewUrl }]);
        const updated = this.messages.mutate(message.id, setAttachmentPreview(index, patch));
        if (updated) this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
      } catch (err) {
        console.warn(`playback copy failed for ${message.id}#${index}:`, (err as Error).message);
      } finally {
        if (source) void unlink(source);
      }
    }
  }

  private async buildPlayback(a: Attachment, source: string): Promise<Record<string, unknown>> {
    const keepDuration = (a.durationSec as number) > 0;
    if (a.kind === "voice") {
      const out = await mediaPreview().generateAudioPreview(source);
      try {
        const previewUrl = await uploadTransfer().storeGeneratedFile(out.previewPath);
        return { previewUrl, ...(!keepDuration && out.durationSec > 0 ? { durationSec: out.durationSec } : {}) };
      } finally {
        await unlink(out.previewPath);
      }
    }
    // Кружок: квадрат до 480 px, звук как у видео.
    const out = await mediaPreview().generateVideoPreview(source, { height: 480 });
    try {
      const previewUrl = await uploadTransfer().storeGeneratedFile(out.previewPath);
      return { previewUrl, ...(!keepDuration && out.durationSec > 0 ? { durationSec: out.durationSec } : {}) };
    } finally {
      await unlink(out.previewPath);
      await unlink(out.posterPath);
    }
  }

  private async attachPreviews(chat: Chat, message: Message): Promise<void> {
    for (const [index, attachment] of (message.attachments ?? []).entries()) {
      const filename = needsPreview(attachment) ? uploadFilename(attachment.url) : null;
      if (!filename) continue;
      let preview: Record<string, unknown> | null = null;
      try {
        preview = await this.buildPreview(attachment, filename);
      } catch (err) {
        console.error(`preview generation failed for ${message.id}#${index}:`, (err as Error).message);
      }
      if (preview) uploadAccess().registerAttachments(chat.id, [{ url: preview.previewUrl, thumbUrl: preview.posterUrl }]);
      const updated = this.messages.mutate(message.id, setAttachmentPreview(index, preview ?? {}));
      if (updated) this.realtime.broadcastToUsers(chat.memberIds, { type: "message:updated", chatId: chat.id, message: updated });
    }
  }

  // Видео истории — как в сообщениях: перекодируем в H.264/AAC (1080p, звук 160 кбит/с,
  // быстрый старт), чтобы оно открывалось везде и не грузилось часами в 4K. Пока идёт
  // обработка — оригинал.
  private async processStoryVideos(story: Story): Promise<void> {
    for (const [index, item] of story.items.entries()) {
      // previewUrl уже есть — видео обработано до перезапуска, задача пришла повторно.
      if (item.kind !== "video" || item.previewUrl || !String(item.url).startsWith("/uploads/")) continue;
      let source: string | null = null;
      try {
        source = await uploadTransfer().fetchUploadToTemp(item.url.slice("/uploads/".length));
        const out = await mediaPreview().generateVideoPreview(source, { height: 1080, crf: 21, audioBitrate: "160k", maxrate: "6000k" });
        try {
          const previewUrl = await uploadTransfer().storeGeneratedFile(out.previewPath);
          const posterUrl = await uploadTransfer().storeGeneratedFile(out.posterPath);
          this.stories.updateItem(story.id, index, { previewUrl, posterUrl, width: out.width, height: out.height, durationSec: out.durationSec });
          this.realtime.broadcastToUsers(this.audience.audienceOf(story.userId), { type: "story:updated", storyId: story.id, userId: story.userId });
        } finally {
          void unlink(out.previewPath);
          void unlink(out.posterPath);
        }
      } catch (err) {
        console.error(`story video processing failed for ${story.id}#${index}:`, (err as Error).message);
      } finally {
        if (source) void unlink(source);
      }
    }
  }
}

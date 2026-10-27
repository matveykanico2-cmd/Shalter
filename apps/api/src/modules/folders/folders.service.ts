import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { FoldersRepository } from "./folders.repository.js";
import type { Folder } from "./model/domain.js";
import type { CreateFolderDto, PatchFolderDto } from "./model/schemas/folder.schema.js";

const INVALID_LINK = "Ссылка недействительна или отозвана";

// Папки чатов и ссылки-приглашения в них (/api/folders) — как server/routes/folders.js.
@Injectable()
export class FoldersService {
  public constructor(
    private readonly folders: FoldersRepository,
    private readonly chats: ChatsRepository,
    private readonly realtime: RealtimeService
  ) {}

  public list(uid: string) {
    return { folders: this.folders.findForOwner(uid) };
  }

  public create(uid: string, { name, chatIds }: CreateFolderDto) {
    return { folder: this.createFor(uid, name, chatIds) };
  }

  /** Поля уже очищены схемой; null — переданное неверное значение. */
  public update(uid: string, id: string, { name, chatIds, order }: PatchFolderDto) {
    this.ownFolder(uid, id);
    const patch: { name?: string; chatIds?: string[]; order?: number } = {};
    if (name !== undefined) {
      if (name === null) throw new ApiError(400, "Введите название папки");
      patch.name = name;
    }
    if (chatIds !== undefined) {
      if (chatIds === null) throw new ApiError(400, "Некорректный список чатов");
      patch.chatIds = chatIds;
    }
    if (order !== undefined) {
      if (order === null) throw new ApiError(400, "Некорректный порядок");
      patch.order = order;
    }
    return { folder: this.folders.update(id, patch) };
  }

  public delete(uid: string, id: string) {
    this.ownFolder(uid, id);
    this.folders.delete(id);
    return { ok: true };
  }

  public createInviteLink(uid: string, id: string) {
    const folder = this.ownFolder(uid, id);
    return { folder: this.folders.setInviteCode(folder.id, randomBytes(8).toString("hex")) };
  }

  public revokeInviteLink(uid: string, id: string) {
    const folder = this.ownFolder(uid, id);
    return { folder: this.folders.setInviteCode(folder.id, null) };
  }

  /** Что в папке по ссылке: только публичные чаты. */
  public preview(code: string) {
    const folder = this.folders.findByInviteCode(code);
    if (!folder) throw new ApiError(404, INVALID_LINK);
    const chats = folder.chatIds
      .map((id) => this.chats.findById(id))
      .filter((c) => c?.isPublic)
      .map((c) => ({ id: c!.id, type: c!.type, title: c!.title, username: c!.username, avatarColor: c!.avatarColor, avatarImage: c!.avatarImage }));
    return { name: folder.name, chats };
  }

  /** Копия папки себе: вступление во все её публичные чаты, кроме тех, где вход по заявке. */
  public import(uid: string, code: string) {
    const folder = this.folders.findByInviteCode(code);
    if (!folder) throw new ApiError(404, INVALID_LINK);

    const chatIds: string[] = [];
    for (const id of folder.chatIds) {
      const chat = this.chats.findById(id);
      if (!chat?.isPublic) continue;
      chatIds.push(chat.id);
      if (chat.memberIds.includes(uid)) continue;
      if (chat.approveJoins) continue;
      const updated = this.chats.update(chat.id, { memberIds: [...chat.memberIds, uid] })!;
      this.realtime.broadcastToUsers([uid], { type: "chat:added", chat: updated });
      this.realtime.broadcastToUsers(chat.memberIds, { type: "chat:updated", chat: updated });
    }
    return { folder: this.createFor(uid, folder.name, chatIds) };
  }

  /** Новая папка — последней в списке. */
  private createFor(uid: string, name: string, chatIds: string[]): Folder {
    const order = this.folders.findForOwner(uid).reduce((max, f) => Math.max(max, (f.order ?? 0) + 1), 0);
    return this.folders.create({ id: genId("f"), ownerId: uid, name, chatIds, order });
  }

  private ownFolder(uid: string, id: string): Folder {
    const folder = this.folders.findById(id);
    if (!folder || folder.ownerId !== uid) throw new ApiError(404, "not found");
    return folder;
  }
}

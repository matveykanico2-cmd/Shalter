import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import {
  MAX_PACK_NAME,
  MAX_STICKERS_PER_PACK,
  type AddStickerDto,
  type CreatePackDto,
  type PatchPackDto,
  type UpdateStickerDto,
} from "./model/schemas/stickers.schema.js";
import { StickerPacksRepository } from "./sticker-packs.repository.js";

// Стикерпаки: паки, стикеры как отдельные строки, коллекция пользователя.
// Права на чтение — любой вошедший пользователь видит свои и добавленные паки;
// менять пак и его стикеры может только владелец (проверяется здесь и в репозитории).
@Injectable()
export class StickerPacksService {
  public constructor(private readonly packs: StickerPacksRepository) {}

  public list(userId: string) {
    return { packs: this.packs.listForViewer(userId), maxStickers: MAX_STICKERS_PER_PACK };
  }

  public get(userId: string, id: string) {
    const pack = this.packs.findPack(id, userId);
    if (!pack) throw new ApiError(404, "Пак не найден");
    return { pack };
  }

  public create(userId: string, { name, description }: CreatePackDto) {
    if (!name || !name.trim()) throw new ApiError(400, "Назовите пак");
    const pack = this.packs.createPack({
      id: `sp_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`,
      ownerId: userId,
      name: name.trim().slice(0, MAX_PACK_NAME),
      description: description ?? null,
      stickers: "[]",
      createdAt: new Date().toISOString(),
    });
    return { pack };
  }

  /** Меняет название и/или описание. Только владелец. */
  public update(userId: string, id: string, { name, description }: PatchPackDto) {
    this.ownerPack(id, userId);
    return { pack: this.packs.updatePack(id, { name: name ?? undefined, description: description ?? undefined }) };
  }

  /** Удаляет пак (стикеры и записи коллекции уходят каскадом). Только владелец. */
  public remove(userId: string, id: string) {
    this.ownerPack(id, userId);
    if (!this.packs.deletePack(id, userId)) throw new ApiError(404, "Пак не найден");
    return { ok: true };
  }

  /** Добавляет стикер в пак (загруженный через /api/uploads файл + эмодзи). Только владелец. */
  public addSticker(userId: string, packId: string, { file, emoji, position }: AddStickerDto) {
    const pack = this.ownerPack(packId, userId);
    if (pack.stickerCount >= MAX_STICKERS_PER_PACK) {
      throw new ApiError(400, `В паке уже максимум ${MAX_STICKERS_PER_PACK} стикеров`);
    }
    const sticker = this.packs.addSticker({
      id: `st_${randomBytes(4).toString("hex")}`,
      packId,
      file,
      emoji,
      position: position ?? pack.stickerCount,
      createdAt: new Date().toISOString(),
    });
    return { sticker };
  }

  /** Меняет эмодзи и/или порядок стикера. Только владелец пака. */
  public updateSticker(userId: string, packId: string, stickerId: string, { emoji, position }: UpdateStickerDto) {
    this.ownerPack(packId, userId);
    const sticker = this.packs.updateSticker(stickerId, packId, { emoji: emoji ?? undefined, position });
    return { sticker };
  }

  /** Удаляет стикер из пака. Только владелец пака. */
  public removeSticker(userId: string, packId: string, stickerId: string) {
    this.ownerPack(packId, userId);
    if (!this.packs.deleteSticker(stickerId, packId)) throw new ApiError(404, "Стикер не найден");
    return { ok: true };
  }

  /** Добавляет пак в коллекцию пользователя. */
  public addToCollection(userId: string, packId: string) {
    const pack = this.packs.findPack(packId);
    if (!pack) throw new ApiError(404, "Пак не найден");
    if (pack.isOwner) return { ok: true };
    this.packs.addToCollection(userId, packId);
    return { ok: true };
  }

  /** Убирает пак из коллекции пользователя (сам пак и отправленные стикеры остаются). */
  public removeFromCollection(userId: string, packId: string) {
    this.packs.removeFromCollection(userId, packId);
    return { ok: true };
  }

  /** Пак есть и пользователь — владелец, иначе 404 (не показываем чужой пак). */
  private ownerPack(id: string, userId: string) {
    const pack = this.packs.findPack(id);
    if (!pack || pack.ownerId !== userId) throw new ApiError(404, "Пак не найден");
    return pack;
  }
}

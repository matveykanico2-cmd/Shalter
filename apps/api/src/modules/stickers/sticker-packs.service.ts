import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { usesForeignUpload } from "../../legacy/legacy.js";
import { MAX_STICKERS, type CreatePackDto, type PatchPackDto } from "./model/schemas/stickers.schema.js";
import { StickerPacksRepository } from "./sticker-packs.repository.js";

// Свои стикерпаки (/api/stickers) — как server/routes/stickers.js и data/stickerPacks.js:
// видны только владельцу; стикеры уже очищены схемой.
@Injectable()
export class StickerPacksService {
  public constructor(private readonly packs: StickerPacksRepository) {}

  public list(userId: string) {
    return { packs: this.packs.listForOwner(userId), maxStickers: MAX_STICKERS };
  }

  public create(userId: string, { name, stickers }: CreatePackDto) {
    if (usesForeignUpload(userId, stickers)) throw new ApiError(400, "Некорректная ссылка на файл");
    const pack = this.packs.create({
      id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId: userId,
      name,
      stickers: JSON.stringify(stickers),
      createdAt: new Date().toISOString(),
    });
    return { pack };
  }

  /** Меняет только переданные поля; пустое название оставляет прежнее. */
  public update(userId: string, id: string, { name, stickers }: PatchPackDto) {
    if (stickers !== undefined) {
      const current = this.packs.find(id);
      if (!current || current.ownerId !== userId) throw new ApiError(404, "Пак не найден");
      if (usesForeignUpload(userId, stickers, current.stickers)) throw new ApiError(400, "Некорректная ссылка на файл");
    }
    const existing = this.packs.findOwnedRow(id, userId);
    if (!existing) throw new ApiError(404, "Пак не найден");
    const pack = this.packs.update(id, {
      name: name ?? existing.name,
      stickers: stickers === undefined ? existing.stickers : JSON.stringify(stickers),
    });
    return { pack };
  }

  public remove(userId: string, id: string) {
    if (!this.packs.delete(id, userId)) throw new ApiError(404, "Пак не найден");
    return { ok: true };
  }
}

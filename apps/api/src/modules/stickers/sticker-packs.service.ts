import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { sanitizers, usesForeignUpload } from "../../legacy/legacy.js";
import type { PackDto } from "./model/schemas/stickers.schema.js";
import { StickerPacksRepository } from "./sticker-packs.repository.js";

// Свои стикерпаки (/api/stickers) — как server/routes/stickers.js и data/stickerPacks.js:
// видны только владельцу; стикер чистит sanitizeSticker из server/ (его же зовёт отправка).
export const MAX_STICKERS = 60;
const MAX_NAME = 40;

@Injectable()
export class StickerPacksService {
  public constructor(private readonly packs: StickerPacksRepository) {}

  public list(userId: string) {
    return { packs: this.packs.listForOwner(userId), maxStickers: MAX_STICKERS };
  }

  public create(userId: string, dto: PackDto) {
    const { name, stickers } = dto;
    if (!String(name ?? "").trim()) throw new ApiError(400, "Назовите пак");
    // «Хотя бы один» — после очистки: пак из одних некорректных стикеров не создаётся пустым.
    const clean = sanitizeStickers(stickers);
    if (!Array.isArray(stickers) || clean.length === 0) throw new ApiError(400, "Добавьте хотя бы один стикер");
    if (usesForeignUpload(userId, clean)) throw new ApiError(400, "Некорректная ссылка на файл");
    const pack = this.packs.create({
      id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId: userId,
      name: String(name ?? "").trim().slice(0, MAX_NAME) || "Мой пак",
      stickers: JSON.stringify(clean),
      createdAt: new Date().toISOString(),
    });
    return { pack };
  }

  /** Меняет только переданные поля; пустое название оставляет прежнее. */
  public update(userId: string, id: string, dto: PackDto) {
    const { name, stickers } = dto;
    if (stickers !== undefined) {
      const current = this.packs.find(id);
      if (!current || current.ownerId !== userId) throw new ApiError(404, "Пак не найден");
      if (usesForeignUpload(userId, sanitizeStickers(stickers), current.stickers)) throw new ApiError(400, "Некорректная ссылка на файл");
    }
    const existing = this.packs.findOwnedRow(id, userId);
    if (!existing) throw new ApiError(404, "Пак не найден");
    const pack = this.packs.update(id, {
      name: name === undefined ? existing.name : String(name).trim().slice(0, MAX_NAME) || existing.name,
      stickers: stickers === undefined ? existing.stickers : JSON.stringify(sanitizeStickers(stickers)),
    });
    return { pack };
  }

  public remove(userId: string, id: string) {
    if (!this.packs.delete(id, userId)) throw new ApiError(404, "Пак не найден");
    return { ok: true };
  }
}

// Не больше MAX_STICKERS, некорректные отбрасываются, анимация сцены не хранится.
function sanitizeStickers(input: unknown): Record<string, unknown>[] {
  if (!Array.isArray(input)) return [];
  const { sanitizeSticker } = sanitizers();
  return input
    .slice(0, MAX_STICKERS)
    .map((s) => sanitizeSticker(s))
    .filter((s) => !!s)
    .map(({ anim: _anim, ...rest }) => rest);
}

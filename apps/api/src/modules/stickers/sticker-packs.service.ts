import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { usesForeignUpload } from "../../legacy/legacy.js";
import { MAX_INSTALLED_PACKS, MAX_STICKERS, PACK_ID, type CreatePackDto, type PatchPackDto } from "./model/schemas/stickers.schema.js";
import { StickerPacksRepository } from "./sticker-packs.repository.js";

// Стикерпаки (/api/stickers) — как server/routes/stickers.js и data/stickerPacks.js; стикеры
// уже очищены схемой. Список — свои паки и добавленные себе чужие. Любой пак открывается
// по id (клик по стикеру в чате, как в Telegram), менять его может только владелец.
@Injectable()
export class StickerPacksService {
  public constructor(private readonly packs: StickerPacksRepository) {}

  public list(userId: string) {
    return { packs: [...this.packs.listForOwner(userId), ...this.packs.listInstalled(userId)], maxStickers: MAX_STICKERS };
  }

  public view(userId: string, id: string) {
    const pack = PACK_ID.test(id) ? this.packs.find(id) : undefined;
    if (!pack) throw new ApiError(404, "Пак не найден");
    return { pack, installed: pack.ownerId === userId || this.packs.isInstalled(userId, id) };
  }

  public install(userId: string, id: string) {
    const pack = PACK_ID.test(id) ? this.packs.find(id) : undefined;
    if (!pack) throw new ApiError(404, "Пак не найден");
    if (pack.ownerId === userId) throw new ApiError(400, "Это ваш пак — он уже у вас");
    if (!this.packs.isInstalled(userId, id)) {
      if (this.packs.countInstalled(userId) >= MAX_INSTALLED_PACKS) throw new ApiError(400, `Можно добавить не больше ${MAX_INSTALLED_PACKS} стикерпаков`);
      this.packs.install(userId, id, new Date().toISOString());
    }
    return { pack, installed: true };
  }

  public uninstall(userId: string, id: string) {
    if (PACK_ID.test(id)) this.packs.uninstall(userId, id);
    return { ok: true };
  }

  public create(userId: string, { name, stickers, description }: CreatePackDto) {
    if (usesForeignUpload(userId, stickers)) throw new ApiError(400, "Некорректная ссылка на файл");
    const pack = this.packs.create({
      id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId: userId,
      name,
      stickers: JSON.stringify(stickers),
      createdAt: new Date().toISOString(),
      description,
    });
    return { pack };
  }

  /** Меняет только переданные поля; пустое название оставляет прежнее. */
  public update(userId: string, id: string, { name, stickers, description }: PatchPackDto) {
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
      description: description ?? existing.description,
    });
    return { pack };
  }

  /**
   * Пак стикера в сообщении: packId остаётся, только если такой пак есть и в нём есть этот
   * стикер (та же картинка или та же метка uid) — иначе клик по стикеру открыл бы чужой пак.
   */
  public packIdFor(raw: unknown, clean: { url?: unknown } | undefined): string | undefined {
    if (!clean || !raw || typeof raw !== "object") return undefined;
    const { packId, uid } = raw as { packId?: unknown; uid?: unknown };
    if (typeof packId !== "string" || !PACK_ID.test(packId)) return undefined;
    const pack = this.packs.find(packId);
    const stickers = (pack?.stickers ?? []) as { url?: unknown; uid?: unknown }[];
    const match = stickers.some((s) => (typeof clean.url === "string" && s.url === clean.url) || (typeof uid === "string" && s.uid === uid));
    return match ? packId : undefined;
  }

  public remove(userId: string, id: string) {
    if (!this.packs.delete(id, userId)) throw new ApiError(404, "Пак не найден");
    return { ok: true };
  }
}

import fs from "node:fs";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { giftMedia, sanitizers, serveUpload, uploadAccess } from "../../legacy/legacy.js";
import { UsersRepository } from "../users/users.repository.js";
import { GiftCatalogService } from "./gift-catalog.service.js";
import { giftSlug, parseSupply, SUPPLY_MAX, SUPPLY_MIN } from "./lib/gift-catalog.js";
import type { CatalogGiftDto, SceneDto, SupplyDto } from "./model/schemas/gift.schema.js";

const EMPTY_SCENE = "Нарисуйте подарок — добавьте хотя бы одну фигуру";

// Каталог подарков в админке (раздел «giftshop», server/routes/gifts.js): тиражи, сцены,
// подарки, выпущенные админом, снятие с продажи и возврат.
@Injectable()
export class GiftCatalogAdminService {
  public constructor(
    private readonly catalog: GiftCatalogService,
    private readonly users: UsersRepository,
  ) {}

  public list(uid: string) {
    this.requireAdmin(uid);
    const gifts = this.catalog
      .list(true)
      .map((g) => (g.supply ? { ...g, issued: this.catalog.issuedCount(g.id), remaining: this.catalog.remaining(g) } : g));
    return { gifts, supplyMin: SUPPLY_MIN, supplyMax: SUPPLY_MAX };
  }

  public setSupply(uid: string, id: string, dto: SupplyDto) {
    this.requireAdmin(uid);
    const gift = this.catalog.get(id);
    if (!gift) throw new ApiError(404, "Подарок не найден");
    if (!gift.supply) throw new ApiError(400, "У этого подарка нет тиража — он безлимитный");

    const parsed = parseSupply(dto.supply);
    if (parsed.error !== undefined) throw new ApiError(400, parsed.error);

    const issued = this.catalog.issuedCount(gift.id);
    if (parsed.value < issued) {
      throw new ApiError(409, `Уже выпущено ${issued.toLocaleString("ru-RU")} шт. — тираж нельзя опустить ниже этого числа`);
    }

    const updated = this.catalog.setSupply(gift.id, parsed.value)!;
    return { gift: { ...updated, issued, remaining: this.catalog.remaining(updated) } };
  }

  public setScene(uid: string, id: string, dto: SceneDto) {
    this.requireAdmin(uid);
    if (!this.catalog.get(id)) throw new ApiError(404, "Подарок не найден");
    let scene: unknown = null;
    if (dto.scene != null) {
      scene = sanitizers().sanitizeScene(dto.scene, { requireLayers: true });
      if (!scene) throw new ApiError(400, EMPTY_SCENE);
    }
    const gift = this.catalog.setScene(id, scene);
    if (!gift) throw new ApiError(404, "Подарок не найден");
    return { gift };
  }

  public async create(uid: string, dto: CatalogGiftDto) {
    this.requireAdmin(uid);
    const { emoji, name, priceStars, premiumDays, supply, exclusive, gifUrl } = dto;

    const scene = dto.scene === undefined ? null : sanitizers().sanitizeScene(dto.scene, { requireLayers: true });
    if (dto.scene !== undefined && !scene) throw new ApiError(400, EMPTY_SCENE);

    if (!String(emoji ?? "").trim()) throw new ApiError(400, "Укажите эмодзи подарка");
    if (!String(name ?? "").trim()) throw new ApiError(400, "Укажите название подарка");
    const price = Number(priceStars);
    if (!Number.isInteger(price) || price < 1) throw new ApiError(400, "Цена — целое число от 1 звезды");

    let supplyValue: number | null = null;
    if (exclusive) {
      const parsed = parseSupply(supply);
      if (parsed.error !== undefined) throw new ApiError(400, parsed.error);
      supplyValue = parsed.value;
    }

    let mediaUrl: string | undefined;
    if (gifUrl) mediaUrl = await this.processGif(gifUrl, uid);

    const gift = this.catalog.create({
      id: `custom_${giftSlug(String(name), 24)}_${Date.now().toString(36)}`,
      emoji: String(emoji).trim().slice(0, 8),
      name: String(name).trim().slice(0, 60),
      priceStars: price,
      premiumDays: premiumDays === null ? null : Number.isInteger(Number(premiumDays)) ? Number(premiumDays) : 0,
      supply: supplyValue,
      exclusive: !!exclusive,
      mediaUrl,
      scene,
    });
    return { gift };
  }

  /** Подарок админа без выданных копий удаляется совсем, остальные — снимаются с продажи. */
  public remove(uid: string, id: string) {
    this.requireAdmin(uid);
    const gift = this.catalog.get(id);
    if (!gift) throw new ApiError(404, "Подарок не найден");

    if (gift.custom && !gift.ownerId && this.catalog.issuedCount(gift.id) === 0) {
      this.catalog.deleteCustom(gift.id);
      return { ok: true, removed: true };
    }

    if (!this.catalog.hideBuiltin(gift.id)) throw new ApiError(400, "Не удалось скрыть подарок");
    return { ok: true, hidden: true };
  }

  public restore(uid: string, id: string) {
    this.requireAdmin(uid);
    if (!this.catalog.restore(id)) throw new ApiError(404, "Скрытый подарок не найден");
    return { ok: true, gift: this.catalog.get(id) };
  }

  private requireAdmin(uid: string): void {
    if (!hasAdminSection(this.users.findById(uid), "giftshop")) throw new ApiError(403, "Недостаточно прав");
  }

  /** Гифка или короткое видео с вырезанным фоном — в хранилище; ссылка на результат. */
  private async processGif(gifUrl: unknown, uid: string): Promise<string> {
    const filename = typeof gifUrl === "string" && gifUrl.startsWith("/uploads/") ? gifUrl.slice("/uploads/".length) : null;
    // Чужую неприкреплённую загрузку в подарок (и тем самым всем) не превращаем.
    if (!filename || !serveUpload().FILENAME_RE.test(filename) || !uploadAccess().canAccessUpload(uid, filename)) {
      throw new ApiError(400, "Некорректная ссылка на гифку — загрузите файл заново");
    }

    const media = giftMedia();
    const sourcePath = await media.fetchUploadToTemp(filename);
    try {
      const cutPath = await media.cutGifBackground(sourcePath);
      try {
        return await media.storeGeneratedFile(cutPath);
      } finally {
        await fs.promises.unlink(cutPath).catch(() => {});
      }
    } catch {
      throw new ApiError(400, "Не удалось обработать гифку — проверьте, что это gif или короткое видео");
    } finally {
      await fs.promises.unlink(sourcePath).catch(() => {});
    }
  }
}

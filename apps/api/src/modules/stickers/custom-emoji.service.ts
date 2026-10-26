import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { UsersRepository } from "../users/users.repository.js";
import { CustomEmojiRepository } from "./custom-emoji.repository.js";
import type { CreateEmojiDto, PatchEmojiDto } from "./model/schemas/stickers.schema.js";

// Каталог своих эмодзи (/api/custom-emoji) — как server/routes/customEmoji.js и
// data/customEmoji.js: смотрят все, меняет раздел админки «emojicatalog». Сцену чистит схема
// (sanitizeScene из server/), а пустую отклоняет сервис — после проверки прав.
export const MAX_EMOJI = 500;
const EMPTY_SCENE = "Нарисуйте эмодзи — добавьте хотя бы одну фигуру";

@Injectable()
export class CustomEmojiService {
  public constructor(
    private readonly emoji: CustomEmojiRepository,
    private readonly users: UsersRepository
  ) {}

  public list() {
    return { emoji: this.emoji.listAll(), maxEmoji: MAX_EMOJI };
  }

  public create(userId: string, dto: CreateEmojiDto) {
    this.requireEmojiAdmin(userId);
    const clean = dto.scene;
    if (!clean) throw new ApiError(400, EMPTY_SCENE);
    if (this.emoji.count() >= MAX_EMOJI) throw new ApiError(400, `Не больше ${MAX_EMOJI} эмодзи в каталоге`);
    const emoji = this.emoji.create({
      id: `ce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId: userId,
      name: dto.name,
      scene: JSON.stringify(clean),
      createdAt: new Date().toISOString(),
    });
    return { emoji };
  }

  /** Меняет только переданные поля. */
  public update(userId: string, id: string, dto: PatchEmojiDto) {
    this.requireEmojiAdmin(userId);
    const existing = this.emoji.findRow(id);
    if (!existing) throw new ApiError(404, "Эмодзи не найден");
    let scene = existing.scene;
    if (dto.scene !== undefined) {
      if (!dto.scene) throw new ApiError(400, EMPTY_SCENE);
      scene = JSON.stringify(dto.scene);
    }
    const name = dto.name ?? existing.name;
    return { emoji: this.emoji.update(id, { name, scene }) };
  }

  public remove(userId: string, id: string) {
    this.requireEmojiAdmin(userId);
    if (!this.emoji.delete(id)) throw new ApiError(404, "Эмодзи не найден");
    return { ok: true };
  }

  private requireEmojiAdmin(userId: string): void {
    if (!hasAdminSection(this.users.findById(userId), "emojicatalog")) throw new ApiError(403, "Недостаточно прав");
  }
}

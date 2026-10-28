import { Injectable } from "@nestjs/common";
import { ADMIN_PHONE } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { findOrCreateDm, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { InjectDb, type Db } from "../db/db.module.js";
import { partnerProfiles } from "../db/schema.js";

// Партнёрская программа (/api/partners) — как server/routes/partners.js: условия и чат с администрацией.
const PARTNER_TARIFF_TEXT =
  "Условия партнёрской программы обсуждаются индивидуально — напишите администрации через кнопку ниже, расскажите про свою аудиторию, и вам предложат тариф.";

@Injectable()
export class PartnersService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly messages: MessagesRepository,
    @InjectDb() private readonly db: Db
  ) {}

  public me() {
    return { tariffText: PARTNER_TARIFF_TEXT };
  }

  /** Личный чат с главным админом; в пустой чат — первое сообщение от пользователя. */
  public async chat(uid: string) {
    const admin = this.users.findByPhone(ADMIN_PHONE);
    if (!admin) throw new ApiError(503, "Администрация Shalter ещё не зарегистрирована в приложении");
    if (admin.id === uid) throw new ApiError(400, "Вы и есть администрация");

    const chat = await findOrCreateDm(uid, admin.id);
    if (this.messages.listFeed(chat.id, uid).length === 0) {
      await sendMessageAndBroadcast(chat, uid, "Здравствуйте! Хочу узнать про партнёрскую программу.");
    }
    return { chatId: chat.id };
  }

  /** Список всех партнёров (только админ). */
  public list(adminUid: string) {
    this.requireAdmin(adminUid);
    return this.db.select().from(partnerProfiles).all();
  }

  /** Добавить партнёра (только админ). */
  public async create(adminUid: string, dto: { userId: string; username: string; name: string; bio?: string; avatarUrl?: string | null; bannerUrl?: string | null; linkUrl?: string | null }) {
    this.requireAdmin(adminUid);
    const user = this.users.findById(dto.userId);
    if (!user) throw new ApiError(404, "Пользователь не найден");
    const existing = (this.db.$client.prepare("SELECT id, username FROM partner_profiles WHERE userId = ? OR username = ?").get(dto.userId, dto.username) as { username: string } | undefined);
    if (existing) throw new ApiError(400, "Партнёр с таким пользователем или именем уже существует");
    const id = `partner_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    this.db.$client.prepare(
      `INSERT INTO partner_profiles (id, userId, username, name, bio, avatarUrl, bannerUrl, linkUrl, createdBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, dto.userId, dto.username, dto.name, dto.bio ?? "", dto.avatarUrl ?? null, dto.bannerUrl ?? null, dto.linkUrl ?? null, adminUid, now, now);
    return { id, ...dto, createdAt: now, updatedAt: now };
  }

  /** Обновить партнёра (только админ). */
  public async update(adminUid: string, id: string, dto: { username?: string; name?: string; bio?: string; avatarUrl?: string | null; bannerUrl?: string | null; linkUrl?: string | null }) {
    this.requireAdmin(adminUid);
    const existing = (this.db.$client.prepare("SELECT * FROM partner_profiles WHERE id = ?").get(id) as { username: string } | undefined);
    if (!existing) throw new ApiError(404, "Партнёр не найден");
    if (dto.username && dto.username !== existing.username) {
      const dup = this.db.$client.prepare("SELECT id FROM partner_profiles WHERE username = ? AND id <> ?").get(dto.username, id);
      if (dup) throw new ApiError(400, "Такое имя уже занято");
    }
    const now = new Date().toISOString();
    this.db.$client.prepare(
      `UPDATE partner_profiles SET username = COALESCE(?, username), name = COALESCE(?, name), bio = COALESCE(?, bio), avatarUrl = COALESCE(?, avatarUrl), bannerUrl = COALESCE(?, bannerUrl), linkUrl = COALESCE(?, linkUrl), updatedAt = ? WHERE id = ?`
    ).run(dto.username ?? null, dto.name ?? null, dto.bio ?? null, dto.avatarUrl ?? null, dto.bannerUrl ?? null, dto.linkUrl ?? null, now, id);
    return this.db.$client.prepare("SELECT * FROM partner_profiles WHERE id = ?").get(id);
  }

  /** Удалить партнёра (только админ). */
  public delete(adminUid: string, id: string) {
    this.requireAdmin(adminUid);
    const existing = this.db.$client.prepare("SELECT id FROM partner_profiles WHERE id = ?").get(id);
    if (!existing) throw new ApiError(404, "Партнёр не найден");
    this.db.$client.prepare("DELETE FROM partner_profiles WHERE id = ?").run(id);
    return { ok: true };
  }

  /** Получить партнёра по username (публично). */
  public findByUsername(username: string) {
    return this.db.$client.prepare("SELECT * FROM partner_profiles WHERE username = ?").get(username);
  }

  private requireAdmin(uid: string) {
    const user = this.users.findById(uid);
    if (!user || !user.developer) throw new ApiError(403, "Только администрация может управлять партнёрами");
  }
}

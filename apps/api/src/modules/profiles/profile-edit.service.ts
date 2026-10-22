import { Injectable } from "@nestjs/common";
import { isAdminPhone } from "../../common/config/accounts.js";
import { ApiError } from "../../common/errors/api-error.js";
import { verifyPassword } from "../../common/lib/password.js";
import { PHONE_RE, normalizeBirthday, normalizePhone } from "../../common/lib/validators.js";
import { checkUsername, isOwnUploadUrl, usesForeignUpload } from "../../legacy/legacy.js";
import { selfUser } from "../users/lib/user.presenter.js";
import { isUsernameConflict, normalizeUsername } from "../users/lib/username.js";
import type { AvatarEntry, ProfilePatch, User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import type { BlockDto, PatchProfileDto } from "./model/schemas/profile.schema.js";
import { ProfileNotifyService } from "./profile-notify.service.js";

const MAX_NAME = 64;
const MAX_LAST_NAME = 60;
const MAX_BIO = 300;
const MAX_ADDRESS = 200;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const POSTER_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_POSTER_BYTES = 400 * 1024;

const EDITABLE_FIELDS = [
  "name",
  "lastName",
  "username",
  "phone",
  "bio",
  "avatarColor",
  "avatarImage",
  "birthday",
  "businessAddress",
  "businessLat",
  "businessLng",
  "nameColor",
  "profileBanner",
] as const;
const STRING_FIELDS = ["name", "lastName", "username", "phone", "bio", "avatarColor", "birthday", "businessAddress"] as const;
// Встроенные баннеры профиля (public/js/lib/profileBanners.js) и своё фото из загрузок.
const BANNER_ID_RE = /^[a-z0-9-]{1,32}$/;
const BANNER_UPLOAD_RE = /^\/uploads\/[a-z0-9]+_[a-f0-9]{16}\.(jpe?g|png|webp|gif)$/;
// Цвета имени — палитра peer colors из Telegram.
const NAME_COLORS = ["red", "orange", "violet", "green", "cyan", "blue", "pink"];

// Правка своего профиля и блокировки (PATCH /api/users/:id, POST /:id/block) — как
// server/routes/users.js: проверки по порядку, первая ошибка — ответ, и тогда ничего
// не сохраняется.
@Injectable()
export class ProfileEditService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly notify: ProfileNotifyService,
    private readonly privacy: UserPrivacyService
  ) {}

  public async update(uid: string, id: string, body: PatchProfileDto) {
    if (id !== uid) throw new ApiError(403, "forbidden");
    const patch: Record<string, any> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) patch[key] = body[key];
    }

    for (const key of STRING_FIELDS) {
      if (key in patch && patch[key] != null && typeof patch[key] !== "string") throw new ApiError(400, "Некорректное значение поля");
    }
    if ("name" in patch) {
      patch.name = String(patch.name ?? "").trim();
      if (!patch.name) throw new ApiError(400, "Введите имя");
      if (patch.name.length > MAX_NAME) throw new ApiError(400, `Имя — не длиннее ${MAX_NAME} символов`);
    }
    if ("lastName" in patch) {
      patch.lastName = String(patch.lastName ?? "").trim() || null;
      if (patch.lastName && patch.lastName.length > MAX_LAST_NAME) throw new ApiError(400, `Фамилия — не длиннее ${MAX_LAST_NAME} символов`);
    }
    if ("bio" in patch) {
      patch.bio = String(patch.bio ?? "").trim();
      if (patch.bio.length > MAX_BIO) throw new ApiError(400, `«О себе» — не длиннее ${MAX_BIO} символов`);
    }
    if ("avatarColor" in patch && !COLOR_RE.test(patch.avatarColor ?? "")) throw new ApiError(400, "Некорректный цвет");
    if ("businessAddress" in patch) {
      patch.businessAddress = String(patch.businessAddress ?? "").trim() || null;
      if (patch.businessAddress && patch.businessAddress.length > MAX_ADDRESS) throw new ApiError(400, `Адрес — не длиннее ${MAX_ADDRESS} символов`);
    }
    if ("nameColor" in patch) {
      if (patch.nameColor != null && !NAME_COLORS.includes(patch.nameColor)) throw new ApiError(400, "Некорректный цвет имени");
      if (patch.nameColor != null && !this.users.findById(uid)?.isPremium) throw new ApiError(403, "Цвет имени доступен с Shalter Premium");
    }
    if ("profileBanner" in patch) patch.profileBanner = await this.checkBanner(uid, patch.profileBanner);
    for (const key of ["businessLat", "businessLng"]) {
      if (key in patch && patch[key] != null && !Number.isFinite(Number(patch[key]))) throw new ApiError(400, "Некорректные координаты");
    }
    let avatarPoster: unknown;
    if ("avatarImage" in patch) {
      avatarPoster = patch.avatarImage;
      delete patch.avatarImage;
      if (avatarPoster != null && (typeof avatarPoster !== "string" || !POSTER_RE.test(avatarPoster) || avatarPoster.length > MAX_POSTER_BYTES)) {
        throw new ApiError(400, "Некорректное изображение");
      }
    }

    if ("username" in patch) {
      patch.username = normalizeUsername(patch.username);
      const problem = await checkUsername(patch.username, { forUserId: uid });
      if (problem) throw new ApiError(problem.status, problem.error);
    }
    if ("birthday" in patch) {
      const value = String(patch.birthday ?? "").trim();
      if (!value) patch.birthday = null;
      else if (!(patch.birthday = normalizeBirthday(value))) throw new ApiError(400, "Дата рождения указана неверно");
    }
    if ("phone" in patch) patch.phone = this.checkPhone(uid, patch.phone, body.currentPassword);

    // Адрес, фамилия и т. п. тоже видны всем — чужой файл через них не открыть.
    if (usesForeignUpload(uid, patch, this.users.findById(uid))) throw new ApiError(400, "Некорректная ссылка на файл");

    let user: User | undefined;
    try {
      user = this.users.updateProfile(id, patch as ProfilePatch);
    } catch (err) {
      if (isUsernameConflict(err)) throw new ApiError(409, "Этот юзернейм уже занят");
      throw err;
    }
    if (user && avatarPoster !== undefined) {
      const current = user;
      const rest = (current.avatarImages ?? []).filter((a) => a.url !== current.avatarImage);
      const poster = avatarPoster as string | null;
      const list: AvatarEntry[] = poster ? [{ url: poster, kind: "image", poster }, ...rest] : rest;
      user = this.users.setAvatars(uid, list);
    }

    if (user) this.notify.profileChanged(uid, user);
    return { user: user ? selfUser(user) : null };
  }

  public async block(uid: string, id: string, dto: BlockDto) {
    const { blocked } = dto;
    if (id === uid) throw new ApiError(400, "Нельзя заблокировать самого себя");
    // Разблокировать можно и удалённого — чтобы его id не застрял в списке.
    if (blocked && !this.users.findById(id)) throw new ApiError(404, "Пользователь не найден");
    this.users.setBlocked(uid, id, !!blocked);
    // В ответе — тот, кого (раз)блокировали, глазами блокирующего; удалённый — null.
    const target = this.users.findById(id);
    return { user: target ? this.privacy.publicUserFor(target, uid) : null };
  }

  private async checkBanner(uid: string, b: any): Promise<ProfilePatch["profileBanner"]> {
    if (b == null) return null;
    if (typeof b !== "object" || typeof b.id !== "string" || !BANNER_ID_RE.test(b.id)) throw new ApiError(400, "Некорректный баннер");
    if (b.id !== "custom") return { id: b.id };
    if (typeof b.url !== "string" || !BANNER_UPLOAD_RE.test(b.url)) throw new ApiError(400, "Некорректное изображение баннера");
    // Только свой загруженный файл (текущий баннер можно сохранить повторно).
    const currentUrl = (this.users.findById(uid)?.profileBanner as { url?: string } | undefined)?.url;
    if (b.url !== currentUrl && !(await isOwnUploadUrl(uid, b.url))) throw new ApiError(400, "Некорректное изображение баннера");
    return { id: "custom", url: b.url };
  }

  private checkPhone(uid: string, raw: unknown, password: unknown): string {
    const normalized = normalizePhone(raw as string);
    if (!PHONE_RE.test(normalized)) throw new ApiError(400, "Введите номер телефона в формате +79991234567");
    const existing = this.users.findByPhone(normalized);
    if (existing && existing.id !== uid) throw new ApiError(409, "Этот номер уже используется другим аккаунтом");
    // Права админа привязаны к номеру, а номер не подтверждается — поэтому ни занять
    // админский номер, ни освободить его сменой номера нельзя.
    const me = this.users.findById(uid);
    if (normalized !== me?.phone && (isAdminPhone(normalized) || isAdminPhone(me?.phone))) throw new ApiError(403, "Этот номер нельзя установить");
    // К номеру привязаны вход по коду, восстановление доступа и поиск — сменить его
    // можно только с паролем от аккаунта (как и почту).
    if (normalized !== me?.phone) {
      if (typeof password !== "string" || !password) throw new ApiError(400, "Чтобы сменить номер, введите пароль от аккаунта");
      if (!me?.passwordHash || !me?.passwordSalt || !verifyPassword(password, me.passwordHash, me.passwordSalt)) {
        throw new ApiError(401, "Неверный пароль");
      }
    }
    return normalized;
  }
}

import { createHash } from "node:crypto";
import fs from "node:fs";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { isOwnUploadUrl, mediaPreview, uploadAccess, uploadTransfer } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { AvatarEntry, User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { MAX_AVATARS, validateEntry } from "./lib/avatars.js";
import type { AddAvatarDto, SuggestedAvatarDto } from "./model/schemas/profile-media.schema.js";
import { ProfileNotifyService } from "./profile-notify.service.js";

// Аватарки профиля (/api/avatars) — как server/routes/avatars.js. Первая — главная.
@Injectable()
export class AvatarsService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly notify: ProfileNotifyService,
    private readonly messages: MessagesRepository,
    private readonly chats: ChatsRepository
  ) {}

  public list(userId: string) {
    return { avatars: avatarList(this.users.findById(userId)), max: MAX_AVATARS };
  }

  public async add(userId: string, dto: AddAvatarDto) {
    const me = this.users.findById(userId);
    if (!me) throw new ApiError(404, "not found");
    const checked = validateEntry(dto);
    if (checked.error !== undefined) throw new ApiError(400, checked.error);
    // Только свой загруженный файл: не чужая загрузка и не выдуманный адрес.
    if (!(await isOwnUploadUrl(userId, checked.entry.url))) throw new ApiError(400, "Некорректная ссылка на файл");

    // Обработка фона и стикера
    const avatarEntry: AvatarEntry = {
      url: checked.entry.url,
      kind: checked.entry.kind,
      poster: checked.entry.poster,
      background: checked.entry.background,
      stickerId: checked.entry.stickerId,
    };

    const list = [avatarEntry, ...avatarList(me)];
    if (list.length > MAX_AVATARS) throw new ApiError(409, `Больше ${MAX_AVATARS} аватарок не поместится — удалите одну`);
    return this.save(userId, list, true);
  }

  /**
   * «Установить как фото профиля» под фото, которое собеседник предложил в личке. Файл
   * прикреплён к личному чату и виден только его участникам, поэтому аватаркой становится
   * своя копия: фото перекодируется (без EXIF) и записывается новым файлом получателя.
   */
  public async fromSuggestion(userId: string, dto: SuggestedAvatarDto) {
    if (!this.users.findById(userId)) throw new ApiError(404, "not found");
    const message = dto.messageId ? this.messages.findById(dto.messageId) : undefined;
    const chat = message ? this.chats.findById(message.chatId) : undefined;
    if (!message || !chat || !chat.memberIds.includes(userId) || message.deletedForIds.includes(userId)) throw new ApiError(404, "Сообщение не найдено");
    if (!message.photoSuggestion || chat.type !== "dm" || chat.secret || chat.protectedBy?.length) throw new ApiError(400, "Это не предложенное фото профиля");
    if (message.senderId === userId) throw new ApiError(403, "Предложенное вами фото может установить только собеседник");
    const source = /^\/uploads\/([a-z0-9]+_[a-f0-9]{16}(?:\.[a-z0-9]{1,12})?)$/.exec(String(message.attachments?.[0]?.url ?? ""))?.[1];
    if (!source) throw new ApiError(400, "Это не предложенное фото профиля");
    // Обложку проверяем до перекодирования: неверный запрос не оставляет файлов.
    const poster = validateEntry({ url: `/uploads/${source}`, kind: "image", poster: dto.poster });
    if (poster.error !== undefined) throw new ApiError(400, poster.error);
    if (avatarList(this.users.findById(userId)).length >= MAX_AVATARS) throw new ApiError(409, `Больше ${MAX_AVATARS} аватарок не поместится — удалите одну`);

    const url = await this.copyAsOwn(userId, source);
    // Список — заново после перекодирования: за эти секунды аватарки могли измениться.
    // Та же копия уже стоит (нажали второй раз) — делаем её главной, а не дублируем.
    const list = avatarList(this.users.findById(userId)).filter((a) => a.url !== url);
    if (list.length >= MAX_AVATARS) throw new ApiError(409, `Больше ${MAX_AVATARS} аватарок не поместится — удалите одну`);
    return this.save(userId, [{ ...poster.entry, url }, ...list], true);
  }

  // Своя копия фото: перекодирование (без EXIF) и метка-комментарий JPEG с номером копии.
  // Файлы именуются по содержимому (sha_…), и без метки копия совпала бы с превью
  // сообщения — а оно прикреплено к личке и чужим не откроется. Метка одна на пару
  // «получатель + сообщение», поэтому повторное нажатие даёт тот же файл.
  private async copyAsOwn(userId: string, filename: string): Promise<string> {
    const transfer = uploadTransfer();
    const temps: string[] = [];
    try {
      temps.push(await transfer.fetchUploadToTemp(filename));
      temps.push(await mediaPreview().generateImagePreview(temps[0]!));
      const jpeg = await fs.promises.readFile(temps[1]!);
      await fs.promises.writeFile(temps[1]!, withJpegComment(jpeg, `shalter-avatar:${createHash("sha256").update(`${userId}:${filename}`).digest("hex").slice(0, 32)}`));
      const url = await transfer.storeGeneratedFile(temps[1]!);
      uploadAccess().recordUploader(url.slice("/uploads/".length), userId);
      return url;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(500, "Не удалось установить фото");
    } finally {
      for (const t of temps) await fs.promises.unlink(t).catch(() => {});
    }
  }

  public makeMain(userId: string, index: string) {
    const list = [...this.existing(userId, index)];
    const [picked] = list.splice(Number(index), 1);
    return this.save(userId, [picked, ...list], true);
  }

  public remove(userId: string, index: string) {
    const i = Number(index);
    return this.save(
      userId,
      this.existing(userId, index).filter((_, idx) => idx !== i)
    );
  }

  /** Список аватарок, если index в нём есть; иначе 404. */
  private existing(userId: string, index: string): AvatarEntry[] {
    const list = avatarList(this.users.findById(userId));
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) throw new ApiError(404, "Аватарка не найдена");
    return list;
  }

  /** dropEmoji — новое главное фото сменяет смайл на аватарке. */
  private save(userId: string, list: AvatarEntry[], dropEmoji = false) {
    if (dropEmoji) this.users.updateProfile(userId, { avatarEmoji: null });
    const updated = this.users.setAvatars(userId, list)!;
    this.notify.profileChanged(userId, updated);
    return { user: publicUser(updated), avatars: updated.avatarImages };
  }
}

/** JPEG с сегментом-комментарием (COM) сразу после SOI: картинка та же, байты — другие. */
function withJpegComment(jpeg: Buffer, text: string): Buffer {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new ApiError(500, "Не удалось установить фото");
  const body = Buffer.from(text, "utf8").subarray(0, 60_000);
  const head = Buffer.from([0xff, 0xfe, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), head, body, jpeg.subarray(2)]);
}

// У старых профилей есть только avatarImage — он становится единственной аватаркой.
function avatarList(me: User | undefined): AvatarEntry[] {
  const list = me?.avatarImages ?? [];
  if (list.length || !me?.avatarImage) return list;
  return [{ url: me.avatarImage, kind: "image", poster: me.avatarImage }];
}

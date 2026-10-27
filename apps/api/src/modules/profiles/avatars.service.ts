import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { isOwnUploadUrl } from "../../legacy/legacy.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { AvatarEntry, User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { MAX_AVATARS, validateEntry } from "./lib/avatars.js";
import type { AddAvatarDto } from "./model/schemas/profile-media.schema.js";
import { ProfileNotifyService } from "./profile-notify.service.js";

// Аватарки профиля (/api/avatars) — как server/routes/avatars.js. Первая — главная.
@Injectable()
export class AvatarsService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly notify: ProfileNotifyService
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

    const list = [checked.entry, ...avatarList(me)];
    if (list.length > MAX_AVATARS) throw new ApiError(409, `Больше ${MAX_AVATARS} аватарок не поместится — удалите одну`);
    return this.save(userId, list);
  }

  public makeMain(userId: string, index: string) {
    const list = [...this.existing(userId, index)];
    const [picked] = list.splice(Number(index), 1);
    return this.save(userId, [picked, ...list]);
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

  private save(userId: string, list: AvatarEntry[]) {
    const updated = this.users.setAvatars(userId, list)!;
    this.notify.profileChanged(userId, updated);
    return { user: publicUser(updated), avatars: updated.avatarImages };
  }
}

// У старых профилей есть только avatarImage — он становится единственной аватаркой.
function avatarList(me: User | undefined): AvatarEntry[] {
  const list = me?.avatarImages ?? [];
  if (list.length || !me?.avatarImage) return list;
  return [{ url: me.avatarImage, kind: "image", poster: me.avatarImage }];
}

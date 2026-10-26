import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { isOwnUploadUrl } from "../../legacy/legacy.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { ProfileTrack } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import type { AddTrackDto } from "./model/schemas/profile-media.schema.js";
import { ProfileNotifyService } from "./profile-notify.service.js";

// Музыка в профиле (/api/profile-track) — как server/routes/profileTrack.js: несколько
// треков, первый — основной (как в профиле Telegram).
const MAX_TRACKS = 20;

@Injectable()
export class ProfileTrackService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly notify: ProfileNotifyService
  ) {}

  /** Добавить трек — в начало, он становится основным. */
  public async add(userId: string, dto: AddTrackDto) {
    const { url, name, size, mimeType, duration } = dto;
    const current = this.current(userId);
    // Только свой загруженный файл (уже добавленный трек можно поднять наверх повторно).
    if (!current.some((t) => t.url === url) && !(await isOwnUploadUrl(userId, url))) {
      throw new ApiError(400, "Загрузите файл через /api/uploads и передайте полученную ссылку");
    }
    const track: ProfileTrack = {
      url,
      name,
      size,
      mimeType,
      duration,
      at: new Date().toISOString(),
    };
    const tracks = [track, ...current.filter((t) => t.url !== url)];
    if (tracks.length > MAX_TRACKS) throw new ApiError(400, `Не больше ${MAX_TRACKS} треков в профиле`);
    return this.save(userId, tracks);
  }

  public makeMain(userId: string, index: string) {
    const tracks = this.current(userId);
    const i = this.existingIndex(tracks, index);
    const [track] = tracks.splice(i, 1);
    return this.save(userId, [track, ...tracks]);
  }

  public remove(userId: string, index: string) {
    const tracks = this.current(userId);
    tracks.splice(this.existingIndex(tracks, index), 1);
    return this.save(userId, tracks);
  }

  public removeAll(userId: string) {
    return this.save(userId, []);
  }

  private current(userId: string): ProfileTrack[] {
    return [...((this.users.findById(userId)?.profileTracks ?? []) as ProfileTrack[])];
  }

  private existingIndex(tracks: ProfileTrack[], index: string): number {
    const i = Number(index);
    if (!Number.isInteger(i) || !tracks[i]) throw new ApiError(404, "Трек не найден");
    return i;
  }

  private save(userId: string, tracks: ProfileTrack[]) {
    const updated = this.users.setProfileTracks(userId, tracks)!;
    this.notify.profileChanged(userId, updated);
    return { user: publicUser(updated) };
  }
}

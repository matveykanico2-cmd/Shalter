import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { StatusEntry } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { slotsFor, validateImage } from "./lib/profile-status.js";
import type { ActiveStatusDto, AddStatusDto } from "./model/schemas/profile-media.schema.js";
import { ProfileNotifyService } from "./profile-notify.service.js";
import { ProfileStatusesRepository } from "./profile-statuses.repository.js";

// Свои статусы профиля (/api/status) — как server/routes/profileStatus.js. Без Premium — один слот.
@Injectable()
export class ProfileStatusService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly catalog: ProfileStatusesRepository,
    private readonly notify: ProfileNotifyService
  ) {}

  /** Каталог статусов, из которого выбирают свой (GET /api/status-catalog). */
  public listCatalog() {
    return { items: this.catalog.list() };
  }

  public mine(userId: string) {
    const state = this.users.statusState(userId)!;
    return { items: state.items, activeId: state.activeStatusId, max: slotsFor(this.users.findById(userId)) };
  }

  public add(userId: string, dto: AddStatusDto) {
    const me = this.users.findById(userId);
    if (!me) throw new ApiError(404, "not found");

    const state = this.users.statusState(userId)!;
    const max = slotsFor(me);
    if (state.items.length >= max) {
      throw new ApiError(409, max === 1 ? "Больше одного статуса не поместится — сначала удалите текущий" : `Больше ${max} статусов не поместится`);
    }

    let image: string;
    let name: string;
    let catalogId: string | undefined;
    if (dto.catalogId !== undefined) {
      const found = this.catalog.findById(dto.catalogId);
      if (!found) throw new ApiError(404, "Такого статуса нет в каталоге");
      image = found.image;
      name = found.name;
      catalogId = found.id;
    } else {
      const checked = validateImage(dto.image);
      if (checked.error !== undefined) throw new ApiError(400, checked.error);
      image = checked.image;
      name = dto.name;
    }

    const entry: StatusEntry = {
      id: `us_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      image,
      name,
      catalogId,
      addedAt: new Date().toISOString(),
    };
    const items = [...state.items, entry];
    const activeStatusId = state.activeStatusId ?? entry.id;
    return { user: this.save(userId, items, activeStatusId), items, activeId: activeStatusId };
  }

  public setActive(userId: string, dto: ActiveStatusDto) {
    const state = this.users.statusState(userId)!;
    const id = dto.id ?? null;
    if (id !== null && !state.items.some((i) => i.id === id)) throw new ApiError(404, "Статус не найден");
    return { user: this.save(userId, state.items, id as string | null), activeId: id };
  }

  public remove(userId: string, id: string) {
    const state = this.users.statusState(userId)!;
    const items = state.items.filter((i) => i.id !== id);
    const activeStatusId = state.activeStatusId === id ? null : state.activeStatusId;
    return { user: this.save(userId, items, activeStatusId), items, activeId: activeStatusId };
  }

  private save(userId: string, items: StatusEntry[], activeStatusId: string | null) {
    const updated = this.users.setStatusState(userId, items, activeStatusId)!;
    this.notify.profileChanged(userId, updated);
    return publicUser(updated);
  }
}

import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { validateImage } from "../profiles/lib/profile-status.js";
import { ProfileStatusesRepository } from "../profiles/profile-statuses.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdminAccessService } from "./admin-access.service.js";
import type { CreateLabelDto, StatusItemDto, UpdateLabelDto } from "./model/schemas/admin.schema.js";
import { SafetyLabelsRepository } from "./safety-labels.repository.js";

const MAX_STATUS_NAME = 40;

// Списки модерации (раздел «moderation»): метки безопасности (server/data/safetyLabels.js) и
// каталог статусов профиля (server/data/profileStatuses.js).
@Injectable()
export class AdminCatalogService {
  public constructor(
    private readonly access: AdminAccessService,
    private readonly labels: SafetyLabelsRepository,
    private readonly statuses: ProfileStatusesRepository,
    private readonly users: UsersRepository,
  ) {}

  public listLabels(uid: string) {
    this.access.require(uid, "moderation");
    return { labels: this.labels.list() };
  }

  public createLabel(uid: string, dto: CreateLabelDto) {
    this.access.require(uid, "moderation");
    const row = { ...dto, id: dto.id || `label_${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
    if (!row.id || !row.short || !row.label) throw new ApiError(400, "Нужны идентификатор, короткая надпись и название");
    if (this.labels.findById(row.id)) throw new ApiError(400, "Метка с таким идентификатором уже есть");
    this.labels.create(row);
    return { label: row };
  }

  public updateLabel(uid: string, id: string, dto: UpdateLabelDto) {
    this.access.require(uid, "moderation");
    const existing = this.labels.findById(id);
    if (!existing) throw new ApiError(404, "Метка не найдена");
    const patch = {
      short: dto.short ?? existing.short,
      label: dto.label ?? existing.label,
      hint: dto.hint ?? existing.hint,
      color: dto.color ?? existing.color,
    };
    if (!patch.short || !patch.label) throw new ApiError(400, "Нужны короткая надпись и название");
    this.labels.update(id, patch);
    return { label: this.labels.findById(id) };
  }

  /** Метка уходит и из профилей, где стояла. */
  public deleteLabel(uid: string, id: string) {
    this.access.require(uid, "moderation");
    this.users.clearSafetyLabel(id);
    this.labels.delete(id);
    return { ok: true };
  }

  public createStatus(uid: string, dto: StatusItemDto) {
    this.access.require(uid, "moderation");
    const checked = validateImage(dto.image);
    if (checked.error !== undefined) throw new ApiError(400, checked.error);
    const item = this.statuses.create({
      id: `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      image: checked.image,
      name: dto.name.slice(0, MAX_STATUS_NAME),
      createdAt: new Date().toISOString(),
    });
    return { item };
  }

  public deleteStatus(uid: string, id: string) {
    this.access.require(uid, "moderation");
    this.statuses.delete(id);
    return { ok: true };
  }
}

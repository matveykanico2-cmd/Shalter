import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { validateImage } from "../profiles/lib/profile-status.js";
import { ProfileStatusesRepository } from "../profiles/profile-statuses.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdminAccessService } from "./admin-access.service.js";
import type { SafetyLabelDto, StatusItemDto } from "./model/schemas/admin.schema.js";
import { SafetyLabelsRepository } from "./safety-labels.repository.js";

const MAX_STATUS_NAME = 40;

/** id метки: латиница, цифры и «_», до 24 символов. */
const normalizeLabelId = (raw: unknown) =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);

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

  public createLabel(uid: string, dto: SafetyLabelDto) {
    this.access.require(uid, "moderation");
    const wanted = normalizeLabelId(dto.id || dto.short);
    const row = {
      id: wanted || `label_${Date.now().toString(36)}`,
      short: String(dto.short ?? "").trim().slice(0, 16).toUpperCase(),
      label: String(dto.label ?? "").trim().slice(0, 60),
      hint: String(dto.hint ?? "").trim().slice(0, 300),
      color: String(dto.color ?? "#c6403b").trim().slice(0, 24),
      createdAt: new Date().toISOString(),
    };
    if (!row.id || !row.short || !row.label) throw new ApiError(400, "Нужны идентификатор, короткая надпись и название");
    if (this.labels.findById(row.id)) throw new ApiError(400, "Метка с таким идентификатором уже есть");
    this.labels.create(row);
    return { label: row };
  }

  public updateLabel(uid: string, id: string, dto: SafetyLabelDto) {
    this.access.require(uid, "moderation");
    const existing = this.labels.findById(id);
    if (!existing) throw new ApiError(404, "Метка не найдена");
    const patch = {
      short: dto.short === undefined ? existing.short : String(dto.short).trim().slice(0, 16).toUpperCase(),
      label: dto.label === undefined ? existing.label : String(dto.label).trim().slice(0, 60),
      hint: dto.hint === undefined ? existing.hint : String(dto.hint).trim().slice(0, 300),
      color: dto.color === undefined ? existing.color : String(dto.color).trim().slice(0, 24),
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
      name: String(dto.name ?? "").trim().slice(0, MAX_STATUS_NAME),
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

import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { buildUserExport } from "../../legacy/legacy.js";
import { UsersRepository } from "../users/users.repository.js";
import { AdminAccessService } from "./admin-access.service.js";
import { DataExportsRepository } from "./data-exports.repository.js";
import type { ExportDto, LookupQuery } from "./model/schemas/admin.schema.js";

// Юридический отдел (раздел «legal», server/routes/admin.js): поиск аккаунта, выгрузка его
// данных по адресному запросу с записью в журнал, сам журнал.
@Injectable()
export class AdminLegalService {
  public constructor(
    private readonly access: AdminAccessService,
    private readonly users: UsersRepository,
    private readonly exports: DataExportsRepository,
  ) {}

  /** По id, @нику, номеру или почте. */
  public lookup(uid: string, query: LookupQuery) {
    this.access.require(uid, "legal");
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const target = q
      ? (this.users.findById(q) ?? this.users.findByUsername(q.replace(/^@/, "")) ?? this.users.findByPhone(q) ?? this.users.findByEmail(q))
      : undefined;
    if (!target) throw new ApiError(404, "Пользователь не найден");
    return { user: { id: target.id, name: target.name, username: target.username || null, phone: target.phone || null, email: target.email || null } };
  }

  public async export(uid: string, dto: ExportDto) {
    const admin = this.access.require(uid, "legal");
    const { reason } = dto;
    if (!reason || !String(reason).trim()) {
      throw new ApiError(400, "Укажите основание (номер дела / реквизиты постановления) — оно записывается в журнал");
    }
    const target = this.access.target(dto.userId);
    const data = (await buildUserExport(target.id, {})) as { stats: { messageCount: number } };
    const log = this.exports.log({ adminId: admin.id, targetUserId: target.id, reason: String(reason).trim(), messageCount: data.stats.messageCount });
    return { exportId: log.id, data };
  }

  public list(uid: string) {
    this.access.require(uid, "legal");
    return {
      exports: this.exports.list().map((r) => {
        const admin = this.users.findById(r.adminId);
        const target = this.users.findById(r.targetUserId);
        return {
          id: r.id,
          at: r.createdAt,
          reason: r.reason,
          messageCount: r.messageCount,
          admin: admin ? { id: admin.id, name: admin.name } : { id: r.adminId },
          target: target ? { id: target.id, name: target.name, username: target.username || null } : { id: r.targetUserId },
        };
      }),
    };
  }
}

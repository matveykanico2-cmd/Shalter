import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import type { SessionEntity } from "./model/domain.js";
import { SessionsRepository } from "./sessions.repository.js";

@Injectable()
export class SessionsService {
  public constructor(private readonly sessionsRepository: SessionsRepository) {}

  public list(userId: string, currentDeviceId: string): SessionEntity[] {
    return this.sessionsRepository.list(userId).map(({ deviceId, ...s }) => ({ ...s, deviceId: s.id, current: deviceId === currentDeviceId }));
  }

  // Текущий сеанс так не завершить — для него есть выход из аккаунта.
  public revoke(userId: string, currentDeviceId: string, id: string): void {
    const target = this.sessionsRepository.getById(userId, id);
    if (!target) throw new ApiError(404, "Сеанс не найден");
    if (target.deviceId === currentDeviceId) throw new ApiError(400, "Нельзя завершить текущий сеанс — используйте выход из аккаунта");
    this.sessionsRepository.revokeById(userId, target.id);
  }

  public revokeOthers(userId: string, currentDeviceId: string): void {
    this.sessionsRepository.revokeOthers(userId, currentDeviceId);
  }
}

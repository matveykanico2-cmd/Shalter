import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { checkUsername } from "../../legacy/legacy.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { normalizeUsername } from "../users/lib/username.js";
import type { UsernameActionDto } from "./model/schemas/usernames.schema.js";

@Injectable()
export class UsernameAccountService {
  public constructor(private readonly users: UsersRepository) {}

  public mine(userId: string) {
    const user = this.users.findById(userId);
    if (!user) throw new ApiError(404, "Пользователь не найден");
    return { usernames: this.users.listUsernames(userId, user.username) };
  }

  public primary(userId: string, dto: UsernameActionDto) {
    const username = normalizeUsername(dto.username);
    const user = this.users.findById(userId);
    if (!user) throw new ApiError(404, "Пользователь не найден");
    const owned = this.users.listUsernames(userId, user.username).some((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!owned) throw new ApiError(404, "Этот юзернейм не принадлежит вам");
    const updated = this.users.setPrimaryUsername(userId, username);
    if (!updated) throw new ApiError(409, "Не удалось назначить основной юзернейм");
    return { user: publicUser(updated), usernames: this.users.listUsernames(userId, updated.username) };
  }

  public pin(userId: string, dto: UsernameActionDto) {
    const username = normalizeUsername(dto.username);
    const user = this.users.findById(userId);
    if (!user || !this.users.listUsernames(userId, user.username).some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      throw new ApiError(404, "Этот юзернейм не принадлежит вам");
    }
    if (username.toLowerCase() === user.username.toLowerCase()) return this.mine(userId);
    this.users.setUsernamePinned(userId, username, dto.pinned !== false);
    return this.mine(userId);
  }

  public async add(userId: string, dto: UsernameActionDto) {
    const username = normalizeUsername(dto.username);
    const problem = await checkUsername(username, { forUserId: userId });
    if (problem) throw new ApiError(problem.status, problem.error);
    this.users.addUsername(userId, username, false);
    return this.mine(userId);
  }
}

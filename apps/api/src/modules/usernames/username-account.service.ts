import { randomBytes } from "node:crypto";
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
    return { usernames: this.withPurchasePrices(userId, user.username) };
  }

  public primary(userId: string, dto: UsernameActionDto) {
    const username = normalizeUsername(dto.username);
    const user = this.users.findById(userId);
    if (!user) throw new ApiError(404, "Пользователь не найден");
    const owned = this.users.listUsernames(userId, user.username).some((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!owned) throw new ApiError(404, "Этот юзернейм не принадлежит вам");
    const updated = this.users.setPrimaryUsername(userId, username);
    if (!updated) throw new ApiError(409, "Не удалось назначить основной юзернейм");
    return { user: publicUser(updated), usernames: this.withPurchasePrices(userId, updated.username) };
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

  public remove(userId: string, rawUsername: string) {
    const username = normalizeUsername(rawUsername);
    const user = this.users.findById(userId);
    if (!user) throw new ApiError(404, "Пользователь не найден");
    const owned = this.users.listUsernames(userId, user.username).some((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!owned) throw new ApiError(404, "Этот юзернейм не принадлежит вам");
    if (user.username?.toLowerCase() === username.toLowerCase()) {
      const replacement = this.users.listUsernames(userId, user.username).find((item) => !item.primary);
      if (replacement) {
        this.users.setPrimaryUsername(userId, replacement.username);
        this.users.removeUsername(username);
        return this.mine(userId);
      }
      const generatedUsername = this.generateUsername();
      this.users.setUsername(userId, generatedUsername);
      return { ...this.mine(userId), generatedUsername };
    }
    this.users.removeUsername(username);
    return this.mine(userId);
  }

  public async rename(userId: string, rawCurrent: string, dto: UsernameActionDto) {
    const currentName = normalizeUsername(rawCurrent);
    const nextName = normalizeUsername(dto.username);
    const user = this.users.findById(userId);
    if (!user) throw new ApiError(404, "Пользователь не найден");
    const current = this.users.listUsernames(userId, user.username).find((item) => item.username.toLowerCase() === currentName.toLowerCase());
    if (!current) throw new ApiError(404, "Этот юзернейм не принадлежит вам");
    if (currentName.toLowerCase() === nextName.toLowerCase()) return this.mine(userId);
    const problem = await checkUsername(nextName, { forUserId: userId });
    if (problem) throw new ApiError(problem.status, problem.error);
    if (current.primary) {
      this.users.addUsername(userId, nextName, true);
      this.users.setPrimaryUsername(userId, nextName);
      this.users.removeUsername(currentName);
    } else {
      this.users.removeUsername(currentName);
      this.users.addUsername(userId, nextName, current.pinned);
    }
    return this.mine(userId);
  }

  private generateUsername(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = `user_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`.slice(0, 32);
      if (!this.users.findByUsername(candidate)) return candidate;
    }
    throw new ApiError(503, "Не удалось создать временный юзернейм");
  }

  private withPurchasePrices(userId: string, primary: string | null | undefined) {
    const prices = this.users.usernamePrices(userId);
    return this.users.listUsernames(userId, primary).map((item) => ({ ...item, ...(prices.has(item.username.toLowerCase()) ? { purchasePriceStars: prices.get(item.username.toLowerCase()) } : {}) }));
  }
}

import { Injectable } from "@nestjs/common";
import type { GiftEntry } from "../users/lib/user.mapper.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";

// Аватар отправителя у полученных подарков — актуальный, глазами того, кто смотрит: с учётом
// приватности фото отправителя и того, как он записан у смотрящего в контактах (server/lib/giftSenders.js).
// Анонимные подарки не раскрываем.
@Injectable()
export class GiftSendersService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly privacy: UserPrivacyService,
  ) {}

  public withGiftSenders<T>(gifts: T, viewerId: string): T {
    if (!Array.isArray(gifts) || !gifts.length) return gifts;
    const senders = new Map<string, ReturnType<UserPrivacyService["publicUserFor"]> | null>();
    const senderOf = (id: string) => {
      if (!senders.has(id)) {
        const user = this.users.findById(id);
        senders.set(id, user ? this.privacy.publicUserFor(user, viewerId) : null);
      }
      return senders.get(id);
    };
    return (gifts as GiftEntry[]).map((g) => {
      if (g.anon || !g.fromId) return g;
      const sender = senderOf(g.fromId);
      if (!sender) return g;
      return {
        ...g,
        fromName: sender.name ?? g.fromName,
        fromAvatarColor: sender.avatarColor ?? g.fromAvatarColor ?? null,
        fromAvatarImage: sender.avatarImage ?? null,
      };
    }) as T;
  }

  /** Пользователь с подарками, у которых проставлены аватары отправителей. */
  public withGiftSendersOn<U extends { giftsReceived?: unknown }>(user: U, viewerId: string): U {
    if (!user || !Array.isArray(user.giftsReceived)) return user;
    return { ...user, giftsReceived: this.withGiftSenders(user.giftsReceived, viewerId) };
  }
}

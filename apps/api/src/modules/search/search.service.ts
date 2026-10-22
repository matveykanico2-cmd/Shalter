import { Injectable } from "@nestjs/common";
import { chatSummary, searchGames, textCrypto } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import type { Chat } from "../chats/model/domain.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { publicUser } from "../users/lib/user.presenter.js";
import type { User } from "../users/model/domain.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import { UsersRepository } from "../users/users.repository.js";

const LIMIT = 20;

// Общий поиск: свои чаты, публичные каналы и группы, люди, боты, игры и сообщения —
// как server/routes/search.js.
@Injectable()
export class SearchService {
  public constructor(
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly users: UsersRepository,
    private readonly userSettings: UserSettingsService,
    private readonly privacy: UserPrivacyService
  ) {}

  public async search(uid: string, rawQuery: unknown) {
    const raw = String(rawQuery ?? "").trim();
    const q = raw.toLowerCase();
    const handle = q.replace(/^@/, "");
    if (!q) return { chats: [], channels: [], users: [], bots: [], games: [], messages: [] };

    // Секретные чаты в общий поиск не попадают — как в Telegram.
    const allChats = this.chats.findForUser(uid).filter((c) => !c.secret);
    const users = this.users.search(raw, LIMIT);
    const publicChannels = this.chats.searchPublic(raw);
    const settings = this.userSettings.get(uid);

    // «Удалённые у себя» чаты ищутся так же, как показываются в списке: только после
    // нового сообщения. Собеседник такой лички находится среди людей.
    const hiddenChats = settings.hiddenChats ?? {};
    const hiddenCandidates = allChats.filter((c) => hiddenChats[c.id]);
    const stillHidden = new Set(hiddenCandidates.map((c) => c.id));
    const summary = chatSummary();
    for (const c of summary.withoutHidden(await summary.attachSummaries(hiddenCandidates, uid), hiddenChats)) stillHidden.delete(c.id);
    const chats = allChats.filter((c) => !stillHidden.has(c.id));

    const peerOf = (c: Chat): string | null => (c.type === "dm" || c.type === "bot" ? (c.memberIds.find((id) => id !== uid) ?? null) : null);
    const peers = new Map(this.users.findNamesByIds(chats.map(peerOf)).map((u) => [u.id, u]));
    const isSaved = (c: Chat) => c.type === "dm" && c.memberIds.length === 1 && c.memberIds[0] === uid;
    const peerFor = (c: Chat) => {
      const id = peerOf(c);
      return id ? peers.get(id) : undefined;
    };
    const nameOf = (c: Chat): string => (isSaved(c) ? "избранное" : (peerFor(c)?.name ?? c.title ?? "").toLowerCase());
    const handleOf = (c: Chat): string => (peerFor(c)?.username ?? c.username ?? "").toLowerCase();

    const matchedChats = chats
      .filter((c) => nameOf(c).includes(q) || (handle && handleOf(c).includes(handle)))
      .sort((a, b) => {
        const rank = (c: Chat) => (handleOf(c).startsWith(handle) ? 0 : nameOf(c).startsWith(q) ? 1 : 2);
        return rank(a) - rank(b);
      });
    const peersInResults = new Set(matchedChats.map(peerOf).filter(Boolean));

    const joined = new Set(chats.map((c) => c.id));
    const matchedChannels = publicChannels
      .filter((c) => !joined.has(c.id))
      .slice(0, LIMIT)
      .map((c) => ({
        id: c.id,
        title: c.title,
        username: c.username,
        description: c.description,
        avatarColor: c.avatarColor,
        avatarImage: c.avatarImage,
        subscriberCount: c.memberIds.length,
      }));

    const score = (u: User): number => {
      const name = (u.name ?? "").toLowerCase();
      const uname = (u.username ?? "").toLowerCase();
      if (uname === handle || name === q) return 0;
      if (uname.startsWith(handle)) return 1;
      if (name.startsWith(q)) return 2;
      if (uname.includes(handle)) return 3;
      return 4;
    };
    const matchedAccounts = users
      .filter(
        (u) =>
          u.id !== uid &&
          !u.isBanned &&
          !peersInResults.has(u.id) &&
          (u.name.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(handle))
      )
      .sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "ru"));

    const clears = settings.chatClears ?? {};
    const match = textCrypto().searchQuery(q);
    const matchedMessages = (match ? this.messages.search(chats.map((c) => c.id), match, LIMIT) : [])
      // Удалённые «у себя» и стёртые очисткой истории не должны всплывать в поиске.
      .filter((m) => !m.deletedForIds?.includes(uid) && !(clears[m.chatId] && m.createdAt <= clears[m.chatId]))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      chats: matchedChats,
      channels: matchedChannels,
      users: this.privacy.publicUsersFor(matchedAccounts.filter((u) => !u.isBot).slice(0, LIMIT), uid),
      bots: matchedAccounts.filter((u) => u.isBot).map(publicUser).slice(0, LIMIT),
      games: searchGames(q, uid, LIMIT),
      messages: matchedMessages,
    };
  }
}

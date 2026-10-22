import { Injectable } from "@nestjs/common";
import { chatForViewer, publicJsonReplacer } from "../../legacy/legacy.js";
import { ChatsRepository, deviceHash } from "../chats/chats.repository.js";
import { SessionsRepository } from "../sessions/sessions.repository.js";
import { ContactsRepository } from "../users/contacts.repository.js";
import { privacyAllows } from "../users/lib/privacy-rules.js";
import type { User } from "../users/model/domain.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import type { WsEvent, WsStats } from "./model/domain.js";
import { SocketRegistry } from "./stores/socket-registry.js";

// Рассылка событий по открытым сокетам, «в сети» и закрытие сокетов при отзыве доступа —
// то, что было в server/ws.js. Старый код в этом процессе шлёт события сюда же
// (server/ws.js → useRealtime), фоновый процесс — через основной (lib/workerBridge.js).
@Injectable()
export class RealtimeService {
  private readonly onlineListeners: ((uid: string) => void)[] = [];

  public constructor(
    private readonly sockets: SocketRegistry,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly sessions: SessionsRepository,
    private readonly userSettings: UserSettingsService,
    private readonly contacts: ContactsRepository
  ) {}

  public broadcastToUsers(userIds: Iterable<string>, message: WsEvent): void {
    const chat = message.chat as { id?: unknown; type?: unknown; memberIds?: unknown } | undefined;
    const chatId = message.chatId ?? chat?.id;
    // Событие с каналом: админы получают его целиком, подписчики — без списка
    // подписчиков, и у каждого в memberIds только он сам.
    if (chat && chat.type === "channel" && Array.isArray(chat.memberIds)) {
      const viewer = chatForViewer();
      const full = JSON.stringify(message, publicJsonReplacer);
      for (const uid of userIds) {
        // Офлайн-подписчиков пропускаем сразу: у канала их десятки тысяч.
        if (!this.sockets.has(uid)) continue;
        const payload = viewer.hidesMembers(chat, uid)
          ? JSON.stringify({ ...message, chat: viewer.chatForViewer(chat, uid) }, publicJsonReplacer)
          : full;
        this.sendPayload([uid], payload, chatId);
      }
      return;
    }
    this.sendPayload(userIds, JSON.stringify(message, publicJsonReplacer), chatId);
  }

  /** Событие всем участникам чата, кроме автора действия (его вкладка уже знает ответ). */
  public broadcastToOthers(chat: { memberIds: string[] }, uid: string, message: WsEvent): void {
    this.broadcastToUsers(chat.memberIds.filter((id) => id !== uid), message);
  }

  /** Готовый JSON — на все сокеты пользователей; событие секретного чата — только на привязанное устройство. */
  public sendPayload(userIds: Iterable<string>, payload: string, chatId: unknown): void {
    const devices = typeof chatId === "string" ? this.chats.secretDevices(chatId) : null;
    for (const uid of userIds) {
      const set = this.sockets.socketsOf(uid);
      if (!set) continue;
      const device = devices ? (devices[uid] ?? null) : null;
      for (const ws of set) {
        if (device && (ws.deviceId ? deviceHash(ws.deviceId) : null) !== device) continue;
        if (ws.readyState === ws.OPEN) ws.send(payload);
      }
    }
  }

  public stats(): WsStats {
    let sockets = 0;
    for (const set of this.sockets.all()) sockets += set.size;
    return { onlineUsers: this.sockets.userCount, sockets };
  }

  /** Кто-то вошёл в сеть (первый сокет) — так отложенные «когда будет в сети» уходят сразу. */
  public onUserOnline(listener: (uid: string) => void): void {
    this.onlineListeners.push(listener);
  }

  /** Первый сокет: «в сети» тем, кому это видно, и отложенные «когда будет в сети». */
  public async markOnline(uid: string): Promise<void> {
    const user = this.users.setPresence(uid, true);
    if (user) await this.broadcastPresence(user, { type: "presence:update", userId: uid, online: true, lastSeen: user.lastSeen });
    for (const listener of this.onlineListeners) listener(uid);
  }

  /** Последний сокет закрыт: «был(а) в сети» с этого момента. */
  public async markOffline(uid: string): Promise<void> {
    const lastSeen = new Date().toISOString();
    const user = this.users.setPresence(uid, false, lastSeen);
    if (user) await this.broadcastPresence(user, { type: "presence:update", userId: uid, online: false, lastSeen });
  }

  /** После перезапуска ни у кого нет сокетов — все, кто числился в сети, из неё выходят. */
  public resetStalePresence(): void {
    try {
      this.users.resetStalePresence();
    } catch (err) {
      console.error("presence reset failed:", err);
    }
  }

  /** Закрывает (4001 session_revoked) сокеты устройств без живой сессии или все сокеты забаненного. */
  public closeRevokedSockets(uid: string): void {
    const set = this.sockets.socketsOf(uid);
    if (!set) return;
    let banned: boolean;
    try {
      banned = !!this.users.findById(uid)?.isBanned;
    } catch (err) {
      console.error("ws session check failed:", err);
      return;
    }
    for (const ws of [...set]) {
      if (banned || !this.sessions.isActive(uid, ws.deviceId)) ws.close(4001, "session_revoked");
    }
  }

  // Онлайн и «был(а) в сети» видят только те, кому это разрешено настройками
  // приватности, — как в профиле. Заблокированные — никогда.
  private async broadcastPresence(user: User, message: WsEvent): Promise<void> {
    const { privacy } = this.userSettings.get(user.id);
    const contactIds = this.contacts.contactIdsOf(user.id);
    const blocked = new Set<string>(user.blockedUserIds ?? []);
    const viewers = this.sockets
      .onlineUserIds()
      .filter((viewerId) => viewerId === user.id || (!blocked.has(viewerId) && privacyAllows(privacy, "lastSeen", viewerId, contactIds.has(viewerId))));
    this.broadcastToUsers(viewers, message);
  }
}

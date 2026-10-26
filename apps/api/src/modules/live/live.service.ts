import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { hasAdminSection } from "../../common/lib/admin-access.js";
import { rtmp } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { isStaff } from "../chats/lib/chat-permissions.js";
import type { Chat } from "../chats/model/domain.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import { publicUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { LiveRepository } from "./live.repository.js";
import type { LiveMessageRow, LiveStream } from "./model/domain.js";
import type { HandDto, LiveMessageDto, MuteDto, RoleDto, StartLiveDto } from "./model/schemas/live.schema.js";

const canStop = (stream: LiveStream, chat: Chat, userId: string) => stream.hostId === userId || isStaff(chat, userId);

// Прямые эфиры в каналах и группах (server/routes/live.js): из приложения (WebRTC между
// участниками, сигналы — по WS) или из OBS (RTMP, server/rtmp.js), с чатом эфира.
@Injectable()
export class LiveService {
  public constructor(
    private readonly live: LiveRepository,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly realtime: RealtimeService,
  ) {}

  /** Начать эфир; в чате уже идёт — тот же, с already. host — заголовок Host запроса (адрес для OBS). */
  public start(uid: string, host: string | undefined, { chatId, title, withVideo, source }: StartLiveDto) {
    const chat = this.memberChat(uid, chatId);
    if (chat.type === "dm") throw new ApiError(400, "Эфир бывает в канале или группе — для двоих есть звонок");
    if (!isStaff(chat, uid)) throw new ApiError(403, "Начать эфир может только администратор");

    const already = this.live.findLiveForChat(chat.id);
    if (already) return { stream: already, already: true, ingest: this.ingestFor(already, uid, host) };

    const stream = this.live.createStream({
      chatId: chat.id,
      hostId: uid,
      title,
      withVideo,
      source,
      streamKey: source === "rtmp" ? randomBytes(16).toString("hex") : null,
    });
    this.realtime.broadcastToUsers(chat.memberIds, { type: "live:started", chatId: chat.id, stream });
    return { stream, ingest: this.ingestFor(stream, uid, host) };
  }

  public forChat(uid: string, chatId: string) {
    const chat = this.memberChat(uid, chatId);
    const canHost = isStaff(chat, uid);
    const stream = this.live.findLiveForChat(chat.id);
    if (!stream) return { stream: null, viewers: 0, canHost };
    return { stream, viewers: this.live.listParticipants(stream.id).length, canHost, canStop: canStop(stream, chat, uid) };
  }

  public get(uid: string, id: string, host: string | undefined) {
    const { stream } = this.load(uid, id);
    return { ...this.stateOf(stream), ingest: this.ingestFor(stream, uid, host) };
  }

  /** Адрес локального FLV-потока эфира из OBS для прокси /feed.flv. */
  public feedUrl(uid: string, id: string): string {
    const { stream } = this.load(uid, id);
    if (stream.source !== "rtmp") throw new ApiError(404, "Этот эфир идёт не через OBS");
    const url = rtmp().internalFlvUrl(this.live.streamKey(stream.id));
    if (!url) throw new ApiError(404, "Поток не найден");
    return url;
  }

  public join(uid: string, id: string, host: string | undefined) {
    const { stream } = this.load(uid, id);
    if (stream.status !== "live") throw new ApiError(410, "Эфир уже завершён");
    this.live.setParticipant(stream.id, uid, stream.hostId === uid ? { role: "host" } : {});
    this.broadcastState(stream);
    return { ...this.stateOf(stream), ingest: this.ingestFor(stream, uid, host) };
  }

  /** Выход; ведущий, выходя, завершает эфир. */
  public leave(uid: string, id: string) {
    const { stream, chat } = this.load(uid, id);
    this.live.removeParticipant(stream.id, uid);

    if (stream.hostId === uid && stream.status === "live") {
      const ended = this.live.endStream(stream.id);
      this.realtime.broadcastToUsers(chat.memberIds, { type: "live:ended", chatId: ended.chatId, streamId: ended.id });
      return { ok: true, ended: true };
    }

    this.realtime.broadcastToUsers([...this.participantIds(stream), uid], { type: "live:state", streamId: stream.id });
    return { ok: true };
  }

  public hand(uid: string, id: string, { raised }: HandDto) {
    const { stream } = this.load(uid, id);
    if (!this.live.findParticipant(stream.id, uid)) throw new ApiError(404, "Вы не в эфире");
    this.live.setParticipant(stream.id, uid, { handRaised: raised });
    this.broadcastState(stream);
    return { ok: true };
  }

  /** Ведущий даёт слово (speaker) или забирает (viewer); рука опускается, запрет микрофона снимается. */
  public setRole(uid: string, id: string, userId: string, { role }: RoleDto) {
    const stream = this.hostStream(uid, id);
    this.guestOf(stream, userId);
    this.live.setParticipant(stream.id, userId, { role, handRaised: false, mutedByHost: false });
    this.broadcastState(stream);
    return { ok: true };
  }

  public mute(uid: string, id: string, userId: string, { muted }: MuteDto) {
    const stream = this.hostStream(uid, id);
    // Свой микрофон ведущий выключает сам, у себя: «заглушить» — только для других.
    this.guestOf(stream, userId);
    this.live.setParticipant(stream.id, userId, { mutedByHost: muted });
    this.broadcastState(stream);
    return { ok: true };
  }

  public stop(uid: string, id: string) {
    const { stream, chat } = this.load(uid, id);
    if (!canStop(stream, chat, uid)) throw new ApiError(403, "Завершить эфир может ведущий или администратор чата");
    if (stream.status !== "live") return { stream };
    if (stream.source === "rtmp") rtmp().stopPublisher(this.live.streamKey(stream.id));
    const ended = this.live.endStream(stream.id);
    this.realtime.broadcastToUsers(chat.memberIds, { type: "live:ended", chatId: ended.chatId, streamId: ended.id });
    return { stream: ended };
  }

  public sendMessage(uid: string, id: string, { text }: LiveMessageDto) {
    const { stream } = this.load(uid, id);
    if (stream.status !== "live") throw new ApiError(410, "Эфир завершён");
    if (!text) throw new ApiError(400, "Пустое сообщение");

    const saved = this.live.addMessage(stream.id, uid, text);
    const message = { id: saved.id, text: saved.text, createdAt: saved.createdAt, user: this.publicUserOf(uid) };
    this.realtime.broadcastToUsers(this.participantIds(stream), { type: "live:message", streamId: stream.id, message });
    return { message };
  }

  public editMessage(uid: string, id: string, messageId: string, { text }: LiveMessageDto) {
    const { stream, message: existing } = this.loadMessage(uid, id, messageId);
    if (existing.userId !== uid) throw new ApiError(403, "Править можно только своё сообщение");
    if (!text) throw new ApiError(400, "Пустое сообщение");

    const saved = this.live.editMessage(existing.id, text);
    const message = { id: saved.id, text: saved.text, createdAt: saved.createdAt, editedAt: saved.editedAt, user: this.publicUserOf(uid) };
    this.realtime.broadcastToUsers(this.participantIds(stream), { type: "live:message-updated", streamId: stream.id, message });
    return { message };
  }

  /** Своё — автор; чужое — ведущий, админ чата или модератор платформы. */
  public deleteMessage(uid: string, id: string, messageId: string) {
    const { stream, chat, message } = this.loadMessage(uid, id, messageId);
    const allowed = message.userId === uid || canStop(stream, chat, uid) || hasAdminSection(this.users.findById(uid), "moderation");
    if (!allowed) throw new ApiError(403, "Удалить чужое сообщение может ведущий или администратор чата");

    this.live.deleteMessage(message.id);
    this.realtime.broadcastToUsers(this.participantIds(stream), { type: "live:message-deleted", streamId: stream.id, messageId: message.id });
    return { ok: true };
  }

  /** Эфир и его чат; смотреть может только участник чата. */
  private load(uid: string, id: string): { stream: LiveStream; chat: Chat } {
    const stream = this.live.findStream(id);
    if (!stream) throw new ApiError(404, "Эфир не найден");
    const chat = this.chats.findById(stream.chatId);
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(403, "Нет доступа к этому эфиру");
    return { stream, chat };
  }

  private loadMessage(uid: string, id: string, messageId: string): { stream: LiveStream; chat: Chat; message: LiveMessageRow } {
    const found = this.load(uid, id);
    const message = this.live.findMessage(messageId);
    if (!message || message.streamId !== found.stream.id) throw new ApiError(404, "Сообщение не найдено");
    return { ...found, message };
  }

  private hostStream(uid: string, id: string): LiveStream {
    const { stream } = this.load(uid, id);
    if (stream.hostId !== uid) throw new ApiError(403, "Управлять эфиром может только ведущий");
    return stream;
  }

  /** Участник эфира, но не ведущий. */
  private guestOf(stream: LiveStream, userId: string): void {
    const target = this.live.findParticipant(stream.id, userId);
    if (!target) throw new ApiError(404, "Этого человека нет в эфире");
    if (target.role === "host") throw new ApiError(400, "Ведущего нельзя лишить слова");
  }

  private memberChat(uid: string, chatId: string | undefined): Chat {
    const chat = chatId === undefined ? undefined : this.chats.findById(chatId);
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "Чат не найден");
    return chat;
  }

  /** Адрес и ключ для OBS — только ведущему эфира из OBS. */
  private ingestFor(stream: LiveStream, uid: string, host: string | undefined) {
    if (stream.source !== "rtmp" || stream.hostId !== uid) return null;
    return { url: rtmp().ingestUrlFor(host), key: this.live.streamKey(stream.id) };
  }

  private stateOf(stream: LiveStream) {
    const author = (userId: string) => {
      const user = this.users.findById(userId);
      return user ? publicUser(user) : { id: userId, name: "—" };
    };
    return {
      stream,
      participants: this.live.listParticipants(stream.id).map((p) => ({ ...p, user: author(p.userId) })),
      messages: this.live.listMessages(stream.id).map((m) => ({
        id: m.id,
        text: m.text,
        createdAt: m.createdAt,
        editedAt: m.editedAt ?? undefined,
        user: author(m.userId),
      })),
    };
  }

  private participantIds(stream: LiveStream): string[] {
    return this.live.listParticipants(stream.id).map((p) => p.userId);
  }

  private broadcastState(stream: LiveStream): void {
    this.realtime.broadcastToUsers(this.participantIds(stream), { type: "live:state", streamId: stream.id });
  }

  private publicUserOf(uid: string) {
    const user = this.users.findById(uid);
    return user && publicUser(user);
  }
}

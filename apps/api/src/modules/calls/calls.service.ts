import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { genId } from "../../common/lib/gen-id.js";
import { iceServers, sendMessageAndBroadcast } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { RealtimeService } from "../realtime/realtime.service.js";
import type { User } from "../users/model/domain.js";
import { ContactsRepository } from "../users/contacts.repository.js";
import { StarsRepository } from "../users/stars.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { CallNotifyService } from "./call-notify.service.js";
import { CallsRepository } from "./calls.repository.js";
import type { Call, CallPatch } from "./model/domain.js";
import type { CreateCallDto, PatchCallDto } from "./model/schemas/call.schema.js";

const MAX_RING_ALL = 12;
const ALLOWED_CALL_STATUSES = new Set<unknown>(["ongoing", "ended", "missed", "completed", "declined"]);
const FINISHED_CALL_STATUSES = new Set<unknown>(["ended", "missed", "completed", "declined"]);
// Через POST /api/calls — только обычные звонки; голосовой чат группы («voice-room»)
// создаётся своим маршрутом /room/:chatId/join. Клиент (chatView.js) шлёт «audio».
const CALL_KINDS = new Set<unknown>(["audio", "voice", "video"]);

type ColdCallCharge = { ok: true; charged: number } | { ok: false; price: number; balance: number };

// Звонки: история, начало, смена статуса (с итогом в чате и пушем), ответ и выход.
@Injectable()
export class CallsService {
  public constructor(
    private readonly calls: CallsRepository,
    private readonly chats: ChatsRepository,
    private readonly users: UsersRepository,
    private readonly notify: CallNotifyService,
    private readonly realtime: RealtimeService,
    private readonly contacts: ContactsRepository,
    private readonly stars: StarsRepository,
    private readonly privacy: UserPrivacyService
  ) {}

  public iceServers() {
    return { iceServers: iceServers() };
  }

  public async history(uid: string) {
    const calls = this.calls.listFor(uid);
    const otherIds = [...new Set(calls.flatMap((c) => c.participantIds).filter((id) => id !== uid))];
    const users = this.users.findByIds(otherIds);
    const groupTitles = new Map<string, { title: unknown; avatarColor: unknown; avatarImage: unknown }>();
    for (const chatId of new Set(calls.map((c) => c.chatId))) {
      const chat = this.chats.findById(chatId);
      if (chat && chat.type !== "dm") groupTitles.set(chatId, { title: chat.title, avatarColor: chat.avatarColor, avatarImage: chat.avatarImage });
    }
    const visibleById = new Map<string, Record<string, unknown>>();
    for (const u of users) visibleById.set(u.id, this.privacy.publicUserFor(u, uid));
    const resolved = calls.map((call) => {
      const otherId = call.participantIds.find((id) => id !== uid);
      const other = otherId ? visibleById.get(otherId) : null;
      return {
        ...call,
        direction: call.callerId === uid ? "outgoing" : "incoming",
        otherUser: other ?? null,
        group: groupTitles.get(call.chatId) ?? null,
      };
    });
    return { calls: resolved };
  }

  public async create(uid: string, { chatId, kind, ringAll }: CreateCallDto) {
    if (!CALL_KINDS.has(kind)) throw new ApiError(400, "Некорректный вид звонка");
    const chat = typeof chatId === "string" ? this.chats.findById(chatId) : undefined;
    if (!chat || !chat.memberIds.includes(uid)) throw new ApiError(404, "not found");
    // Иначе «звонок» в канал обзванивал бы всех подписчиков разом.
    if (chat.type === "channel") throw new ApiError(400, "В канал позвонить нельзя");
    let ringIds: string[] | null = null;
    if (chat.type === "group" && ringAll) {
      if (chat.memberIds.length > MAX_RING_ALL) {
        throw new ApiError(400, `В группе больше ${MAX_RING_ALL} участников — позвонить всем сразу нельзя. Начните голосовой чат`);
      }
      const others = chat.memberIds.filter((id) => id !== uid);
      const allowed = await Promise.all(others.map((id) => this.notify.canCall(uid, id)));
      ringIds = [uid, ...others.filter((_, i) => allowed[i])];
    }
    if (chat.type !== "group") {
      const otherId = chat.memberIds.find((id) => id !== uid);
      if (otherId && !(await this.notify.canCall(uid, otherId))) throw new ApiError(403, "Пользователь ограничил звонки");
      if (otherId) {
        const target = this.users.findById(otherId);
        // Бот не может взять трубку — звонок висел бы «вызовом» вечно.
        if (target?.isBot) throw new ApiError(400, "Боту позвонить нельзя");
        const charge = await this.chargeForColdCall(uid, target);
        if (!charge.ok) {
          throw new ApiError(402, `Этот пользователь берёт ${charge.price} ⭐ за звонок от незнакомых. Не хватает звёзд. С Premium звонить можно бесплатно`, {
            needStars: charge.price,
            balance: charge.balance,
            premiumHelps: true,
          });
        }
      }
    }
    const call = this.calls.create({
      id: genId("cl"),
      chatId: chat.id,
      kind: kind as string,
      direction: "outgoing",
      callerId: uid,
      participantIds: ringIds ?? (chat.type === "group" ? [uid] : chat.memberIds),
      status: "ongoing",
      startedAt: new Date().toISOString(),
      durationSec: 0,
    });
    await this.notify.broadcastIncoming(call, call.participantIds.filter((id) => id !== uid));
    this.notify.pushIncoming(call, uid, call.participantIds).catch((err: unknown) => console.error("push notify failed:", err));
    return { call };
  }

  public async patch(uid: string, id: string, dto: PatchCallDto) {
    const existing = this.participantCall(id, uid);

    // Не звонящий «завершает» групповой звонок на 3+ — на деле выходит, звонок продолжается.
    if (
      FINISHED_CALL_STATUSES.has(dto.status) &&
      existing.status === "ongoing" &&
      existing.kind !== "voice-room" &&
      existing.callerId !== uid &&
      existing.participantIds.length > 2
    ) {
      return { call: this.leave(existing, uid) };
    }

    // Завершённый звонок обратно не «оживить» — иначе он снова висел бы активным.
    if (dto.status === "ongoing" && existing.status !== "ongoing") throw new ApiError(400, "Звонок уже завершён");
    const patch: CallPatch = {};
    if (ALLOWED_CALL_STATUSES.has(dto.status)) patch.status = dto.status as string;
    if (Number.isFinite(dto.durationSec)) patch.durationSec = Math.max(0, Math.floor(dto.durationSec as number));
    if (!Object.keys(patch).length) return { call: existing };

    const call = this.calls.update(id, patch);
    if (call) {
      this.realtime.broadcastToUsers(call.participantIds, { type: "call:updated", call });
      if (FINISHED_CALL_STATUSES.has(patch.status) && existing.status === "ongoing") await this.postSummary(call, patch);
      if (FINISHED_CALL_STATUSES.has(patch.status)) {
        const missed = patch.status === "missed";
        const callerName = missed ? (this.findUserQuietly(call.callerId)?.name ?? "") : "";
        this.notify
          .pushCancelled(call, call.participantIds, { missed, callerName })
          .catch((err: unknown) => console.error("push cancel failed:", err));
      }
    }
    return { call };
  }

  /** Ответ на одном устройстве: остальные устройства ответившего перестают звонить. */
  public answer(uid: string, id: string) {
    const call = this.participantCall(id, uid);
    this.realtime.broadcastToUsers([uid], { type: "call:answered", callId: call.id });
    return { ok: true };
  }

  /** Выход из звонка; посторонний и несуществующий звонок — тоже {ok:true}. */
  public leaveById(uid: string, id: string) {
    const call = this.calls.findById(id);
    if (call && call.participantIds.includes(uid)) this.leave(call, uid);
    return { ok: true };
  }

  /** Меньше двух участников — звонок завершён (completed с длительностью от начала). */
  private leave(call: Call, uid: string): Call {
    let updated = this.calls.removeParticipant(call.id, uid)!;
    if (updated.participantIds.length < 2 && updated.status === "ongoing") {
      const durationSec = Math.max(0, Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000));
      updated = this.calls.update(call.id, { status: "completed", durationSec })!;
      this.realtime.broadcastToUsers(updated.participantIds, { type: "call:updated", call: updated });
    } else {
      this.realtime.broadcastToUsers(updated.participantIds, { type: "call:participants-updated", call: updated });
    }
    return updated;
  }

  /** Итог звонка в чате — сообщение от звонящего: «Звонок · м:сс», отклонён или пропущен. */
  private async postSummary(call: Call, patch: CallPatch): Promise<void> {
    const durationSec = patch.durationSec ?? 0;
    const answered = patch.status === "completed" && durationSec > 0;
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const video = call.kind === "video";
    const label = answered
      ? `📞 ${video ? "Видеозвонок" : "Звонок"} · ${mins}:${String(secs).padStart(2, "0")}`
      : patch.status === "declined"
        ? video
          ? "📞 Видеозвонок отклонён"
          : "📞 Звонок отклонён"
        : video
          ? "📞 Пропущенный видеозвонок"
          : "📞 Пропущенный звонок";
    const chat = this.chats.findById(call.chatId);
    if (chat) await sendMessageAndBroadcast(chat, call.callerId, label, { type: "call" }).catch(() => {});
  }

  // Звонок незнакомцу, который берёт звёзды за сообщения, платный: кроме его контактов и Premium.
  private async chargeForColdCall(callerId: string, target: User | undefined): Promise<ColdCallCharge> {
    const price = target?.messagePriceStars ?? 0;
    if (!target || price <= 0) return { ok: true, charged: 0 };
    if (this.contacts.contactIdsOf(target.id).has(callerId)) return { ok: true, charged: 0 };
    if (this.users.findById(callerId)?.isPremium) return { ok: true, charged: 0 };
    if (!this.stars.transfer(callerId, target.id, price)) return { ok: false, price, balance: this.stars.balanceOf(callerId) };
    return { ok: true, charged: price };
  }

  private participantCall(id: string, uid: string): Call {
    const call = this.calls.findById(id);
    if (!call || !call.participantIds.includes(uid)) throw new ApiError(404, "not found");
    return call;
  }

  private findUserQuietly(id: string): User | undefined {
    try {
      return this.users.findById(id);
    } catch {
      return undefined;
    }
  }
}

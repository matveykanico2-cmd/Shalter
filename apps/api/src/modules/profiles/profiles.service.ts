import { Injectable } from "@nestjs/common";
import { ApiError } from "../../common/errors/api-error.js";
import { businessStatus, countBotAudience, withGiftSenders } from "../../legacy/legacy.js";
import { ChatsRepository } from "../chats/chats.repository.js";
import { isStaff } from "../chats/lib/chat-permissions.js";
import type { Chat } from "../chats/model/domain.js";
import { MessagesRepository } from "../messages/messages.repository.js";
import { ContactsRepository } from "../users/contacts.repository.js";
import { applyContactName, privacyAllows } from "../users/lib/privacy-rules.js";
import { contactNote } from "../users/lib/contact-note.js";
import { publicUser, selfUser } from "../users/lib/user.presenter.js";
import { UsersRepository } from "../users/users.repository.js";
import { UserPrivacyService } from "../users/user-privacy.service.js";
import { UserSettingsService } from "../users/user-settings.service.js";
import type { PinnedChannelsDto } from "./model/schemas/profile.schema.js";

const LINK_RE = /https?:\/\/\S+/;
const MAX_PINNED_CHANNELS = 6;

interface BusinessSettings {
  enabled?: boolean;
  showHours?: boolean;
  hours?: unknown;
  timeZone?: string | null;
}

function channelCard(chat: Chat, viewerId: string) {
  return {
    id: chat.id,
    title: chat.title,
    username: chat.username ?? null,
    avatarColor: chat.avatarColor ?? null,
    avatarImage: chat.avatarImage ?? null,
    isVerified: !!chat.isVerified,
    members: chat.memberIds.length,
    isMember: chat.memberIds.includes(viewerId),
  };
}

// Чужой и свой профиль, блокировки, закреплённые каналы, общие группы и медиа лички
// (GET /api/users/…) — как server/routes/users.js.
@Injectable()
export class ProfilesService {
  public constructor(
    private readonly users: UsersRepository,
    private readonly chats: ChatsRepository,
    private readonly messages: MessagesRepository,
    private readonly userSettings: UserSettingsService,
    private readonly contacts: ContactsRepository,
    private readonly privacy: UserPrivacyService
  ) {}

  public async blocked(uid: string) {
    const ids = this.users.findById(uid)?.blockedUserIds ?? [];
    if (!ids.length) return { users: [] };
    return { users: this.privacy.publicUsersFor(this.users.findByIds(ids), uid) };
  }

  // Свой ник тоже находим: раньше на него приходило «не найден», и своя ссылка /u/<ник>
  // показывала «такого аккаунта нет», если клиент не узнал её сам.
  public async byUsername(uid: string, username: string) {
    const user = this.users.findByUsername(username);
    if (!user) throw new ApiError(404, "not found");
    const visible = this.privacy.publicUserFor(user, uid);
    return { user: user.id === uid ? { ...visible, isSelf: true } : visible };
  }

  public async profile(uid: string, id: string) {
    const user = this.users.findById(id);
    if (!user) throw new ApiError(404, "not found");

    const isSelf = id === uid;
    const visible: Record<string, unknown> = isSelf ? selfUser(user) : publicUser(user);
    const targetsContacts = isSelf ? [] : this.contacts.findForOwner(id);
    const isContact = !isSelf && targetsContacts.some((c) => c.userId === uid);
    const myContact = isSelf ? null : this.contacts.findForOwner(uid).find((c) => c.userId === id);
    const targetSettings = this.userSettings.get(id);

    if (!isSelf) {
      const canSee = (key: string) => privacyAllows(targetSettings.privacy, key, uid, isContact);
      if (canSee("phone")) visible.phone = user.phone;
      if (!canSee("lastSeen")) {
        delete visible.lastSeen;
        visible.online = false;
      }
      if (!canSee("bio")) delete visible.bio;
      if (!canSee("birthday")) delete visible.birthday;
      if (!canSee("photo")) {
        delete visible.avatarImage;
        delete visible.avatarImages;
      }
      // Заблокированному — как будто всё скрыто настройками: ни фото и статуса,
      // ни телефона, «о себе» и дня рождения.
      if ((user.blockedUserIds ?? []).includes(uid)) {
        delete visible.avatarImage;
        delete visible.avatarImages;
        delete visible.lastSeen;
        delete visible.phone;
        delete visible.bio;
        delete visible.birthday;
        visible.online = false;
      }
      applyContactName(visible, myContact, isContact);
    }

    if (user.isBusiness) {
      const business = targetSettings.business as BusinessSettings | undefined;
      if (business?.enabled && business.showHours !== false && business.hours) {
        visible.businessHours = {
          hours: business.hours,
          timeZone: business.timeZone ?? null,
          status: businessStatus(business.hours, business.timeZone),
        };
      }
    }

    if (user.isBot) visible.botUserCount = countBotAudience(id);

    const commonGroupsCount = isSelf ? 0 : this.commonGroupsOf(uid, id).length;

    if (Array.isArray(visible.giftsReceived)) visible.giftsReceived = await withGiftSenders(visible.giftsReceived, uid);

    return {
      user: visible,
      isContact,
      inContacts: !!myContact,
      contactName: myContact?.localName ?? null,
      contactNote: contactNote(myContact),
      commonGroupsCount,
      pinnedChannels: await this.pinnedChannelsOf(id, uid),
    };
  }

  public pinnableChannels(uid: string) {
    return { channels: this.pinnableChannelsFor(uid).map((c) => channelCard(c, uid)), max: MAX_PINNED_CHANNELS };
  }

  public async setPinnedChannels(uid: string, dto: PinnedChannelsDto) {
    const requested = Array.isArray(dto.chatIds) ? dto.chatIds.filter((id): id is string => typeof id === "string") : [];
    const allowed = new Set(this.pinnableChannelsFor(uid).map((c) => c.id));
    const chatIds = [...new Set(requested)].filter((id) => allowed.has(id)).slice(0, MAX_PINNED_CHANNELS);
    this.userSettings.update(uid, { pinnedChannelIds: chatIds });
    return { pinnedChannels: await this.pinnedChannelsOf(uid, uid) };
  }

  public async sharedMedia(uid: string, id: string) {
    const empty = { chatId: null, media: [], files: [], links: [], voice: [] };
    if (id === uid) return empty;

    const chat = this.chats.findDmBetween(uid, id);
    if (!chat) return empty;

    const clearedBefore = this.userSettings.get(uid).chatClears?.[chat.id] ?? null;
    const messages = this.messages.listMedia(chat.id, uid).filter((m) => !clearedBefore || m.createdAt > clearedBefore);
    const media = [];
    const files = [];
    const links = [];
    const voice = [];
    for (const m of messages) {
      for (const a of m.attachments ?? []) {
        const item = { messageId: m.id, createdAt: m.createdAt, senderId: m.senderId, attachment: a };
        if (a.kind === "image" || a.kind === "video") media.push(item);
        else if (a.kind === "file") files.push(item);
        else if (a.kind === "voice" || a.kind === "video-note") voice.push(item);
      }
      if (m.linkPreview || LINK_RE.test(m.text ?? "")) {
        links.push({ messageId: m.id, createdAt: m.createdAt, text: m.text, linkPreview: m.linkPreview });
      }
    }
    return { chatId: chat.id, media: media.reverse(), files: files.reverse(), links: links.reverse(), voice: voice.reverse() };
  }

  public commonChats(uid: string, id: string) {
    return {
      chats: this.commonGroupsOf(uid, id).map((c) => ({
        id: c.id,
        title: c.title,
        avatarColor: c.avatarColor ?? null,
        avatarImage: c.avatarImage ?? null,
        members: c.memberIds.length,
      })),
    };
  }

  private pinnableChannelsFor(userId: string): Chat[] {
    return this.chats.findForUser(userId).filter((c) => c.type === "channel" && c.isPublic && isStaff(c, userId));
  }

  private async pinnedChannelsOf(userId: string, viewerId: string) {
    const { pinnedChannelIds } = this.userSettings.get(userId);
    const ids = Array.isArray(pinnedChannelIds) ? pinnedChannelIds.slice(0, MAX_PINNED_CHANNELS) : [];
    if (!ids.length) return [];
    return ids
      .map((chatId) => (typeof chatId === "string" ? this.chats.findById(chatId) : undefined))
      .filter((chat): chat is Chat => !!chat && chat.type === "channel" && !!chat.isPublic && isStaff(chat, userId))
      .map((chat) => channelCard(chat, viewerId));
  }

  private commonGroupsOf(viewerId: string, otherId: string): Chat[] {
    if (viewerId === otherId) return [];
    return this.chats.findForUser(viewerId).filter((c) => c.type === "group" && c.memberIds.includes(otherId));
  }
}

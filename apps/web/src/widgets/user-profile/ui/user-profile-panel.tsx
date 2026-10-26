import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useStartCall } from "@/features/call";
import { ProfileQrDialog } from "@/features/profile-qr";

import { ChatPickerDialog, chatQueries, openDm, useChats } from "@/entities/chat";
import { openGiftShop } from "@/entities/gift";
import { ReportDialog } from "@/entities/report";
import { useSafetyLabel } from "@/entities/safety-label";
import { isServerModerator, type SelfUser, sessionQueries } from "@/entities/session";
import { hasUnseen, openStoryViewer, storyQueries, storyWord } from "@/entities/story";
import { bannerBackground, birthdayText, closeUserProfile, isBirthdayToday, ProfileStatusBadge, ProfileTrackCard, type UserProfile, userQueries } from "@/entities/user";

import { useWsEvent } from "@/shared/api";
import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { plural, statusLabel } from "@/shared/lib/presence";
import { publicUrl } from "@/shared/lib/public-link";
import { askConfirm, askText, Avatar, EmojiText, Icon, type IconName, InfoRow, toast } from "@/shared/ui";

import { type ChannelCard, profileApi, profileQueries, type SharedMedia } from "../api/profile-api";
import { type TabId,TABS } from "../lib/tabs";

import { AvatarViewer } from "./avatar-viewer";
import { BusinessHoursRow } from "./business-hours-row";
import { PinnedChannelsDialog } from "./pinned-channels-dialog";
import { ProfileTabContent } from "./profile-tabs";
import styles from "./user-profile.module.css";

type Props = { userId: string; me: SelfUser };
type Overlay = "avatars" | "qr" | "share" | "report" | "channels" | "admin" | null;

// Карточка модератора — отдельным чанком: она нужна только админам.
const AdminUserCard = lazy(() => import("@/features/admin").then((m) => ({ default: m.UserCard })));
type ProfileUser = UserProfile["user"] & { inContacts?: true; mutualContact?: true; profileName?: string };

/**
 * Профиль человека — панель справа поверх всего, как openProfileDialog в
 * public/js/components/profileDialog.js: аватары, статус, быстрые действия, сведения,
 * музыка, часы работы, реклама, действия с контактом, каналы, истории и вкладки.
 */
export function UserProfilePanel({ userId, me }: Props) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const profile = useQuery(userQueries.profile(userId));
  const chats = useChats().data;
  // Медиа из переписки сервер собирает по всей истории — профиль его не ждёт.
  const shared = useQuery({ ...profileQueries.sharedMedia(userId), enabled: userId !== me.id });
  const stories = useQuery(storyQueries.ofUser(userId)).data?.group ?? null;
  const ad = useQuery(profileQueries.ad(userId)).data ?? null;
  const startCall = useStartCall(me);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [tab, setTab] = useState<TabId>("media");
  const tabsRef = useRef<HTMLDivElement>(null);

  const close = closeUserProfile;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Поверх профиля открыто окно (QR, вопрос, жалоба) — Escape закрывает его, а не профиль.
      if (document.querySelector('[role="dialog"]')) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // Удалили сообщение в чате — оно пропадает из «Медиа», «Голосовых», «Файлов», «Ссылок».
  useWsEvent("message:deleted", (e) => {
    const data = client.getQueryData(profileQueries.sharedMedia(userId).queryKey);
    if (!data || data.chatId !== e.chatId) return;
    const keep = <T extends { messageId: string }>(list: T[]) => list.filter((x) => x.messageId !== e.id);
    client.setQueryData(profileQueries.sharedMedia(userId).queryKey, {
      ...data,
      media: keep(data.media),
      files: keep(data.files),
      links: keep(data.links),
      voice: keep(data.voice),
    } satisfies SharedMedia);
  });

  const isSelf = userId === me.id;
  const known = chats?.find((c) => c.otherUser?.id === userId)?.otherUser ?? (isSelf ? me : null);
  const data = profile.data;
  const u = data?.user as ProfileUser | undefined;
  const safety = useSafetyLabel(u?.safetyLabel);

  const patchProfile = (patch: Partial<UserProfile> | ((p: UserProfile) => Partial<UserProfile>)) =>
    client.setQueryData(userQueries.profile(userId).queryKey, (p) => (p ? ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) } as UserProfile) : p));

  if (!data || !u) {
    return (
      <Shell onClose={close}>
        {profile.isError ? (
          <p className={styles.error}>{errorText(profile.error, "Не удалось загрузить профиль")}</p>
        ) : known ? (
          // Пока профиль грузится — сразу аватар и имя, если человек уже известен (из списка чатов).
          <>
            <div className={styles.avatarRow}>
              <Avatar size={88} name={known.name} color={known.avatarColor} image={known.avatarImage} />
            </div>
            <p className={styles.name} translate="no">{known.name}</p>
          </>
        ) : (
          <div className={styles.spinner} />
        )}
      </Shell>
    );
  }

  const blocked = me.blockedUserIds.includes(userId);
  const inContacts = data.inContacts;
  const giftsCount = Array.isArray(u.giftsReceived) ? u.giftsReceived.length : 0;
  const sharedData = shared.data ?? null;
  const has: Record<TabId, boolean> = {
    // Пока медиа грузится, вкладка видна с «Загрузка…» — чтобы она не перескакивала.
    media: (sharedData?.media.length ?? 0) > 0 || (shared.isPending && !isSelf),
    stories: !u.isBot,
    gifts: giftsCount > 0,
    files: (sharedData?.files.length ?? 0) > 0,
    links: (sharedData?.links.length ?? 0) > 0,
    voice: (sharedData?.voice.length ?? 0) > 0,
    groups: data.commonGroupsCount > 0,
  };
  const tabs = TABS.filter((t) => has[t.id]);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : ((tabs.find((t) => t.id !== "stories") ?? tabs[0])?.id ?? "stories");

  const status =
    u.isBot && typeof u.botUserCount === "number"
      ? `бот · ${u.botUserCount.toLocaleString("ru-RU")} ${plural(u.botUserCount, "пользователь", "пользователя", "пользователей")}`
      : statusLabel(u);
  const banner = bannerBackground(u.profileBanner);
  const avatarCount = Array.isArray(u.avatarImages) ? u.avatarImages.length : 0;
  const tracks = u.profileTracks?.length ? u.profileTracks : u.profileTrack ? [u.profileTrack] : [];
  const profileLink = () => publicUrl(`/u/${String(u.username ?? "").replace(/^@/, "")}`);

  const startChat = async () => {
    try {
      const { chat } = await openDm(userId, u.name, u.avatarColor);
      if (!chats?.some((c) => c.id === chat.id)) await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
      close();
      void navigate(`/chat/${chat.id}`);
    } catch (err) {
      toast(errorText(err, "Не удалось открыть чат"), { error: true });
    }
  };

  const call = async (kind: "audio" | "video") => {
    try {
      const { chat } = await openDm(userId, u.name, u.avatarColor);
      close();
      await startCall.call(chat.id, kind);
    } catch (err) {
      toast(errorText(err, "Не удалось позвонить"), { error: true });
    }
  };

  const startSecretChat = async () => {
    const ok = await askConfirm(
      `Начать секретный чат с ${u.name}?\n\nСообщения шифруются отдельным ключом этого чата, их нельзя переслать или скопировать. Чат будет доступен только на этом устройстве.`,
      { okLabel: "Начать" }
    );
    if (!ok) return;
    try {
      const { chat } = await profileApi.startSecretChat(userId);
      await client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
      close();
      void navigate(`/chat/${chat.id}`);
    } catch (err) {
      toast(errorText(err, "Не удалось начать секретный чат"), { error: true });
    }
  };

  const toggleBlock = async () => {
    const next = !blocked;
    try {
      await profileApi.setBlocked(userId, next);
    } catch (err) {
      toast(errorText(err, "Не удалось изменить блокировку"), { error: true });
      return;
    }
    client.setQueryData(sessionQueries.current().queryKey, (s) => {
      if (!s?.user) return s;
      const ids = s.user.blockedUserIds.filter((id) => id !== userId);
      return { ...s, user: { ...s.user, blockedUserIds: next ? [...ids, userId] : ids } };
    });
  };

  const toggleContact = async () => {
    if (inContacts && !(await askConfirm(`Удалить ${u.name} из контактов?`))) return;
    try {
      if (inContacts) await profileApi.removeContact(userId);
      else {
        const sharePhone = !u.isBot && (await askConfirm(`Поделиться своим номером телефона с ${u.name}?`, { okLabel: "Поделиться", cancelLabel: "Не делиться" }));
        await profileApi.addContact(userId, sharePhone);
      }
      patchProfile({ inContacts: !inContacts });
      void client.invalidateQueries({ queryKey: userQueries.contacts().queryKey });
      void client.invalidateQueries({ queryKey: userQueries.profile(userId).queryKey });
    } catch (err) {
      toast(errorText(err, "Не удалось изменить контакт"), { error: true });
    }
  };

  const editNote = async () => {
    const next = await askText("Заметка о контакте — её видите только вы. Пусто — удалить.", { initial: data.contactNote ?? "" });
    if (next === null) return;
    try {
      const res = await profileApi.setNote(userId, next);
      patchProfile({ contactNote: res.note ?? null });
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить заметку"), { error: true });
    }
  };

  // Нет смысла слать человеку его же контакт в его же личный чат.
  const selfDm = (chats ?? []).filter((c) => c.type === "dm" && !c.secret && c.otherUser?.id === userId).map((c) => c.id);
  const shareContact = () => {
    if (!(chats ?? []).some((c) => (!c.archived || c.isSaved) && !c.secret && !selfDm.includes(c.id))) {
      toast(`Некому отправить контакт — вы не переписываетесь с ${u.name}`);
      return;
    }
    setOverlay("share");
  };

  // Не подписан — /chat/<id> ответил бы «Чат не найден»: открываем превью канала по нику.
  const openChannel = (channel: ChannelCard) => {
    close();
    const member = chats?.some((c) => c.id === channel.id);
    void navigate(!member && channel.username ? `/@${channel.username}` : `/chat/${channel.id}`);
  };

  const openAd = async () => {
    if (!ad) return;
    close();
    await profileApi.clickAd(ad.id).catch(() => {});
    if (!ad.url) return;
    if (ad.url.startsWith("/")) void navigate(ad.url);
    else if (/^https?:\/\//i.test(ad.url)) window.open(ad.url, "_blank", "noreferrer");
  };

  const showTabs = () => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Shell onClose={close}>
      <div className={banner ? `${styles.avatarRow} ${styles.withBanner}` : styles.avatarRow} style={banner ? ({ "--profile-banner": banner } as CSSProperties) : undefined}>
        <button
          type="button"
          className={styles.avatarButton}
          title={isSelf || u.avatarImage ? "Открыть фото" : undefined}
          aria-label="Открыть фото"
          onClick={() => (isSelf || u.avatarImage ? setOverlay("avatars") : undefined)}
        >
          <Avatar size={88} name={u.name} color={u.avatarColor} image={u.avatarImage} online={u.online} />
          {avatarCount > 1 ? <span className={styles.avatarCount}>{avatarCount}</span> : null}
        </button>
      </div>
      {isSelf ? <p className={styles.selfHint}>Так ваш профиль видят другие</p> : null}
      <p className={styles.name} translate="no">
        <EmojiText text={u.name || "Без имени"} />
        {u.isVerified ? (
          <span className={styles.badge} title="Подтверждённый аккаунт">
            <Icon name="Verified" size={17} />
          </span>
        ) : null}
        {u.isDeveloper ? (
          <span className={styles.badge} title="Разработчик Shalter">
            <Icon name="Code" size={16} />
          </span>
        ) : null}
        {u.isPremium ? (
          <span className={styles.premium} title="Shalter Premium">
            <Icon name="Star" size={18} />
          </span>
        ) : null}
        <ProfileStatusBadge user={{ statusIcon: u.statusIcon, statusName: u.statusName, name: u.name }} size={18} />
      </p>
      <p className={u.online ? `${styles.status} ${styles.online}` : styles.status}>{status ?? "был(а) недавно"}</p>
      {/* Имя уже показано так, как вы записали человека; его собственное — подсказкой. */}
      {u.profileName ? <p className={styles.contactName}>Имя в профиле: {u.profileName}</p> : null}
      {u.mutualContact ? <p className={styles.contactName}>⇄ Взаимный контакт</p> : null}
      {safety ? (
        <div className={styles.warning}>
          <Icon name="Info" size={15} />
          <div>
            <p className={styles.warningTitle}>{safety.label}</p>
            <p className={styles.warningHint}>{safety.hint}</p>
          </div>
        </div>
      ) : null}
      {u.isBanned ? <p className={styles.banned}>🚫 Аккаунт заблокирован администрацией Shalter</p> : null}

      <div className={styles.quickActions}>
        <QuickAction icon={isSelf ? "Bookmark" : "MessageSquare"} label={isSelf ? "Избранное" : "Написать"} onClick={() => void startChat()} />
        {!isSelf && !u.isBot && !blocked ? <QuickAction icon="Phone" label="Звонок" onClick={() => void call("audio")} /> : null}
        {!isSelf && !u.isBot && !blocked ? <QuickAction icon="Video" label="Видео" onClick={() => void call("video")} /> : null}
        {u.username ? <QuickAction icon="Copy" label="Ссылка" onClick={() => void copyText(profileLink(), "Ссылка на профиль скопирована")} /> : null}
        {isSelf && u.username ? <QuickAction icon="Qrcode" label="QR-код" onClick={() => setOverlay("qr")} /> : null}
        {isSelf ? (
          <QuickAction
            icon="Edit"
            label="Изменить"
            onClick={() => {
              close();
              void navigate("/settings/profile");
            }}
          />
        ) : null}
      </div>

      <div className={styles.infoCard}>
        {u.phone ? <InfoRow icon="Phone" value={u.phone} label="Телефон" copy={u.phone} /> : null}
        {u.username ? (
          <InfoRow
            icon="At"
            value={
              <>
                @{u.username}
                {u.isCollectibleUsername ? <span title="Коллекционный юзернейм — выигран на аукционе">💎</span> : null}
              </>
            }
            label="Имя пользователя"
            copy={`@${u.username}`}
          />
        ) : null}
        {u.bio ? <InfoRow icon="Info" value={u.bio} label={u.isBot ? "Описание" : "О себе"} multiline /> : null}
        {inContacts && !isSelf ? (
          <InfoRow icon="Edit" value={data.contactNote || "Добавить заметку"} label="Заметка · видите только вы" accent={!data.contactNote} multiline={!!data.contactNote} onClick={() => void editNote()} />
        ) : null}
        {u.birthday ? (
          <InfoRow icon="Gift" value={isBirthdayToday(u.birthday) ? `🎉 Сегодня день рождения · ${birthdayText(u.birthday)}` : birthdayText(u.birthday)} label="День рождения" />
        ) : null}
        {data.commonGroupsCount > 0 ? (
          <InfoRow
            icon="Users"
            value={`${data.commonGroupsCount} ${plural(data.commonGroupsCount, "общая группа", "общие группы", "общих групп")}`}
            label="Общие группы"
            onClick={() => {
              setTab("groups");
              showTabs();
            }}
          />
        ) : null}
      </div>

      {tracks.length ? (
        <div className={styles.trackSlot}>
          <ProfileTrackCard tracks={tracks} />
        </div>
      ) : null}

      {u.businessHours || (u.isBusiness && u.businessAddress) ? (
        <div className={styles.infoCard}>
          {u.businessHours ? <BusinessHoursRow hours={u.businessHours} /> : null}
          {u.isBusiness && u.businessAddress ? <BusinessLocation user={u} /> : null}
        </div>
      ) : null}

      {u.isAdsActive && u.adText ? (
        <div className={styles.ad}>
          <span className={styles.adLabel}>Реклама</span>
          <p className={styles.adText}>{u.adText}</p>
          {u.adUrl ? (
            <a className={styles.adLink} href={u.adUrl} target="_blank" rel="noreferrer">
              Перейти →
            </a>
          ) : null}
        </div>
      ) : null}
      {ad ? (
        <button type="button" className={styles.ad} title={ad.url ?? undefined} onClick={() => void openAd()}>
          <span className={styles.adLabel}>Реклама</span>
          {ad.title ? (
            <p className={styles.adText}>
              <b>{ad.title}</b>
            </p>
          ) : null}
          <p className={styles.adText}>{ad.text}</p>
        </button>
      ) : null}

      {!isSelf ? (
        <div className={styles.actions}>
          {!u.isBot ? (
            <ActionButton icon={inContacts ? "Trash" : "Plus"} onClick={() => void toggleContact()}>
              {inContacts ? "Удалить из контактов" : "Добавить в контакты"}
            </ActionButton>
          ) : null}
          {!u.isBot ? (
            <ActionButton icon="Gift" onClick={() => openGiftShop({ recipient: { id: u.id, name: u.name } })}>
              Отправить подарок
            </ActionButton>
          ) : null}
          {!u.isBot && !blocked ? (
            <ActionButton icon="Lock" onClick={() => void startSecretChat()}>
              Начать секретный чат
            </ActionButton>
          ) : null}
          <ActionButton icon="Forward" onClick={shareContact}>
            Поделиться контактом
          </ActionButton>
          <ActionButton icon="Lock" danger onClick={() => void toggleBlock()}>
            {blocked ? "Разблокировать" : "Заблокировать"}
          </ActionButton>
          <ActionButton icon="Info" danger onClick={() => setOverlay("report")}>
            Пожаловаться
          </ActionButton>
        </div>
      ) : null}

      {data.pinnedChannels.length || isSelf ? (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <p className={styles.sectionTitle}>Каналы</p>
            {isSelf ? (
              <button type="button" className={styles.linkButton} onClick={() => setOverlay("channels")}>
                {data.pinnedChannels.length ? "Изменить" : "Выбрать"}
              </button>
            ) : null}
          </div>
          {data.pinnedChannels.length ? (
            data.pinnedChannels.map((c) => (
              // Вся строка открывает канал (там — большая кнопка «Подписаться»).
              <button key={c.id} type="button" className={styles.channelRow} onClick={() => openChannel(c)}>
                <Avatar size={42} name={c.title} color={c.avatarColor} image={c.avatarImage} />
                <span className={styles.channelBody}>
                  <span className={styles.channelTitle}>
                    {c.title}
                    {c.isVerified ? (
                      <span className={styles.badge}>
                        <Icon name="Verified" size={13} />
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.channelSub}>
                    {[c.username ? `@${c.username}` : "", c.members ? `${c.members} ${plural(c.members, "подписчик", "подписчика", "подписчиков")}` : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {c.isMember ? <span className={styles.member}>подписаны</span> : null}
                <Icon name="ChevronRight" size={18} />
              </button>
            ))
          ) : (
            <p className={styles.hint}>Закрепите свои публичные каналы — их увидит каждый, кто откроет ваш профиль.</p>
          )}
        </div>
      ) : null}

      {stories?.stories.length ? (
        <div className={styles.stories}>
          <div className={styles.storiesHead}>
            <button
              type="button"
              className={hasUnseen(stories) ? `${styles.storiesCircle} ${styles.unseen}` : styles.storiesCircle}
              title="Смотреть истории"
              aria-label="Смотреть истории"
              onClick={() => openStoryViewer([stories], 0, { onChanged: () => void client.invalidateQueries({ queryKey: storyQueries.ofUser(userId).queryKey }) })}
            >
              {stories.stories[0]?.kind === "video" ? (
                <video className={styles.storiesThumb} src={stories.stories[0].url} muted preload="metadata" />
              ) : (
                <img className={styles.storiesThumb} src={stories.stories[0]?.url} alt="" />
              )}
            </button>
            <div>
              <p className={styles.storiesTitle}>Истории</p>
              <p className={styles.hint}>
                {stories.stories.length} {storyWord(stories.stories.length)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isServerModerator(me) && !isSelf ? (
        <div className={styles.adminBlock}>
          <p className={styles.adminTitle}>
            <Icon name="Shield" size={13} /> {me.isDeveloper ? "Инструменты разработчика" : "Инструменты модератора"}
          </p>
          <ActionButton icon="Shield" onClick={() => setOverlay("admin")}>
            {me.isDeveloper ? "Выдать покупку, модерация, данные" : "Модерация"}
          </ActionButton>
        </div>
      ) : null}

      {tabs.length ? (
        <>
          {/* Вкладки — обычные кнопки, как в profileDialog.js. */}
          <div ref={tabsRef} className={styles.tabs}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={t.id === activeTab}
                className={t.id === activeTab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className={styles.tabContent}>
            <ProfileTabContent tab={activeTab} user={{ ...u, giftsReceived: u.giftsReceived ?? [] }} isSelf={isSelf} shared={sharedData} sharedLoaded={!shared.isPending}
              onGiftsChanged={(giftsReceived) => patchProfile((p) => ({ user: { ...p.user, giftsReceived } as UserProfile["user"] }))}
            />
          </div>
        </>
      ) : null}

      {overlay === "avatars" ? (
        <AvatarViewer
          user={u}
          canEdit={isSelf}
          onChange={(updated) => {
            patchProfile((p) => ({ user: { ...p.user, ...updated } as UserProfile["user"] }));
            if (isSelf) client.setQueryData(sessionQueries.current().queryKey, (s) => (s?.user ? { ...s, user: { ...s.user, ...updated } } : s));
          }}
          onClose={() => setOverlay(null)}
        />
      ) : null}
      {overlay === "qr" ? <ProfileQrDialog user={u} onClose={() => setOverlay(null)} /> : null}
      {overlay === "admin" ? (
        <Suspense fallback={null}>
          <AdminUserCard
            user={{ id: userId, name: u.name }}
            onClose={() => {
              setOverlay(null);
              // Метка, галочка, Premium — могли поменяться: профиль перечитываем.
              void client.invalidateQueries({ queryKey: userQueries.profile(userId).queryKey });
            }}
          />
        </Suspense>
      ) : null}
      {overlay === "report" ? <ReportDialog target={{ type: "user", id: userId }} targetLabel={u.name} onClose={() => setOverlay(null)} /> : null}
      {overlay === "channels" ? <PinnedChannelsDialog pinned={data.pinnedChannels} onSaved={(next) => patchProfile({ pinnedChannels: next })} onClose={() => setOverlay(null)} /> : null}
      {overlay === "share" ? (
        <ChatPickerDialog
          title="Поделиться контактом"
          exclude={selfDm}
          onSend={async (chatId) => {
            try {
              await profileApi.sendContact(chatId, { userId: u.id, name: u.name, phone: u.phone });
              toast("Контакт отправлен");
            } catch (err) {
              toast(errorText(err, "Не удалось отправить контакт"), { error: true });
            }
          }}
          onClose={() => setOverlay(null)}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className={styles.panel} aria-label="Профиль">
        <div className={styles.header}>
          <h2>Профиль</h2>
          <button type="button" className={styles.iconButton} title="Закрыть" aria-label="Закрыть профиль" onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.quickAction} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span className={styles.quickLabel}>{label}</span>
    </button>
  );
}

function ActionButton({ icon, danger, onClick, children }: { icon: IconName; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={danger ? `${styles.actionButton} ${styles.danger}` : styles.actionButton} onClick={onClick}>
      <Icon name={icon} size={22} />
      {children}
    </button>
  );
}

/** Адрес бизнеса (tweb .business-location): нажатие открывает карту, без координат — копирует. */
function BusinessLocation({ user }: { user: { businessAddress?: string; businessLat?: number; businessLng?: number } }) {
  const address = user.businessAddress ?? "";
  const hasGeo = typeof user.businessLat === "number" && typeof user.businessLng === "number";
  return (
    <InfoRow
      icon="MapPin"
      value={address}
      label="Местоположение"
      multiline
      onClick={() => {
        if (!hasGeo) return void copyText(address, "Адрес скопирован");
        void askConfirm("Открыть адрес на карте?", { okLabel: "Открыть" }).then((ok) => {
          if (ok) window.open(`https://yandex.ru/maps/?pt=${user.businessLng},${user.businessLat}&z=17&l=map`, "_blank", "noopener");
        });
      }}
    />
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { chatQueries, type ChatSummary } from "@/entities/chat";
import { graphemes } from "@/entities/message";

import type { Sticker } from "@/shared/lib/anim";
import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { useEscape } from "@/shared/lib/use-escape";
import { Avatar, Button, Icon, TextField, toast } from "@/shared/ui";

import { type ChatProfilePatch, editChatQueries, patchChatProfile, setChatDiscussion } from "../api/edit-chat";
import { allowedReactions } from "../lib/chat-fields";
import { useApplyChat } from "../model/use-apply-chat";
import { useSaveSetting } from "../model/use-save-setting";

import { AvatarChoice } from "./avatar-choice";
import { AdminLogPage, DiscussionPage, ReactionsPage } from "./channel-pages";
import styles from "./edit-chat.module.css";
import { BannedPage, InvitePage, PermissionsPage, RequestsPage, TypePage, WelcomePage } from "./pages";
import { NavRow, Section, ToggleRow } from "./parts";

type Page = "main" | "type" | "invite" | "permissions" | "welcome" | "requests" | "banned" | "reactions" | "discussion" | "log";

const TITLES: Record<Exclude<Page, "main" | "type">, string> = {
  invite: "Пригласительные ссылки",
  permissions: "Права участников",
  welcome: "Приветствие",
  requests: "Заявки на вступление",
  banned: "Заблокированные",
  reactions: "Реакции",
  discussion: "Обсуждение",
  log: "Недавние действия",
};

type Props = { chat: ChatSummary; onClose: () => void; channelStory?: { open: () => void; progress: string | null } };

/** «Изменить группу/канал» вместо информации о чате — как public/js/components/editChatDialog.js. */
export function EditChatPanel({ chat, onClose, channelStory }: Props) {
  const [page, setPage] = useState<Page>("main");
  const isChannel = chat.type === "channel";
  const back = () => setPage("main");
  // Esc — на шаг назад: с подстраницы к правке, с правки — к информации о чате.
  useEscape(page === "main" ? onClose : back);
  const title =
    page === "main" ? (isChannel ? "Изменить канал" : "Изменить группу") : page === "type" ? (isChannel ? "Тип канала" : "Тип группы") : TITLES[page];
  const props = { chat, onBack: back };
  return (
    <>
      <div className={styles.header}>
        <button type="button" className={styles.back} title="Назад" onClick={page === "main" ? onClose : back}>
          <Icon name="ChevronLeft" size={22} />
        </button>
        <h2>{title}</h2>
      </div>
      <div className={styles.body}>
        {/* Главная остаётся смонтированной: набранное название не пропадает за вкладкой. */}
        <div hidden={page !== "main"}>
          <MainPage chat={chat} onOpen={setPage} onDone={onClose} channelStory={channelStory} />
        </div>
        {page === "type" ? <TypePage {...props} /> : null}
        {page === "invite" ? <InvitePage {...props} /> : null}
        {page === "permissions" ? <PermissionsPage {...props} /> : null}
        {page === "welcome" ? <WelcomePage {...props} /> : null}
        {page === "requests" ? <RequestsPage {...props} /> : null}
        {page === "banned" ? <BannedPage {...props} /> : null}
        {page === "reactions" ? <ReactionsPage chat={chat} /> : null}
        {page === "discussion" ? <DiscussionPage chat={chat} /> : null}
        {page === "log" ? <AdminLogPage {...props} /> : null}
      </div>
    </>
  );
}

function MainPage({ chat, onOpen, onDone, channelStory }: { chat: ChatSummary; onOpen: (p: Page) => void; onDone: () => void; channelStory?: { open: () => void; progress: string | null } }) {
  const isChannel = chat.type === "channel";
  const apply = useApplyChat(chat.id);
  const saveSetting = useSaveSetting(chat);
  const [title, setTitle] = useState(chat.title ?? "");
  const [description, setDescription] = useState(chat.description ?? "");
  const [avatarColor, setAvatarColor] = useState<string | null>(chat.avatarColor ?? null);
  const [avatarType, setAvatarType] = useState<"image" | "emoji" | "sticker" | null>(
    chat.avatarImage ? "image" : chat.avatarEmoji ? "emoji" : null
  );
  const [avatarImage, setAvatarImage] = useState<string | null>(chat.avatarImage ?? null);
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(chat.avatarEmoji ?? null);
  const [avatarSticker, setAvatarSticker] = useState<Sticker | null>(null);
  const [avatarPackId, setAvatarPackId] = useState<string | null>(null);
  const [openAvatar, setOpenAvatar] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const permissions = useQuery({ ...editChatQueries.permissions(chat.id), enabled: !isChannel }).data;
  const requests = useQuery(editChatQueries.joinRequests(chat.id)).data;
  const banned = useQuery(editChatQueries.banned(chat.id)).data;
  const colors = useQuery(editChatQueries.colors(chat.id)).data;
  const reactions = allowedReactions(chat);
  const client = useQueryClient();

  const toggleComments = async (on: boolean) => {
    if (on && !chat.linkedDiscussionChatId) {
      try {
        apply((await setChatDiscussion(chat.id, "create")).chat);
        void client.invalidateQueries({ queryKey: chatQueries.list().queryKey });
      } catch (err) {
        toast(errorText(err, "Не удалось включить комментарии"), { error: true });
        return;
      }
    }
    if (await saveSetting({ commentsOff: !on })) toast(on ? "Комментарии включены" : "Комментарии отключены");
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setAvatarType("image");
    setAvatarEmoji(null);
    setAvatarSticker(null);
    setAvatarPackId(null);
    try {
      setAvatarImage(await fileToImageDataUrl(file, 512));
    } catch (err) {
      toast(errorText(err, "Не удалось прочитать изображение"), { error: true });
    }
  };

  const pickEmoji = (e: string) => {
    const g = graphemes(e.trim());
    if (g.length !== 1) return toast("Один смайл", { error: true });
    setAvatarType("emoji");
    setAvatarImage(null);
    setAvatarSticker(null);
    setAvatarPackId(null);
    setAvatarEmoji(g[0]!);
    setOpenAvatar(false);
  };

  const pickSticker = (sticker: Sticker, packId: string | null) => {
    setAvatarType("sticker");
    setAvatarImage(null);
    setAvatarEmoji(null);
    setAvatarSticker(sticker);
    setAvatarPackId(packId);
    setOpenAvatar(false);
  };

  const clearAvatar = () => {
    setAvatarType(null);
    setAvatarImage(null);
    setAvatarEmoji(null);
    setAvatarSticker(null);
    setAvatarPackId(null);
  };

  const save = async () => {
    const t = title.trim();
    if (!t) {
      setTitleError(true);
      titleInput.current?.focus();
      return;
    }
    const patch: ChatProfilePatch = {};
    if (t !== (chat.title ?? "")) patch.title = t;
    if (description.trim() !== (chat.description ?? "")) patch.description = description.trim();
    const prevType = chat.avatarImage ? "image" : chat.avatarEmoji ? "emoji" : null;
    const nextImage = avatarType === "image" ? avatarImage : avatarType === "sticker" ? (avatarSticker?.url ?? null) : null;
    const nextEmoji = avatarType === "emoji" ? avatarEmoji : null;
    if (nextImage !== (chat.avatarImage ?? null)) patch.avatarImage = nextImage;
    if (nextEmoji !== (chat.avatarEmoji ?? null)) patch.avatarEmoji = nextEmoji;
    if (avatarColor !== (chat.avatarColor ?? null)) patch.avatarColor = avatarColor;
    const avatarChanged =
      avatarType !== prevType ||
      (avatarSticker?.id ?? null) !== (chat.stickerId ?? null) ||
      avatarPackId !== (chat.packId ?? null);
    if (avatarChanged) {
      patch.avatarType = avatarType ?? null;
      if (avatarType === "sticker") {
        patch.stickerId = avatarSticker?.id ?? null;
        patch.packId = avatarPackId ?? null;
      } else {
        patch.stickerId = null;
        patch.packId = null;
      }
    }
    if (!Object.keys(patch).length) return onDone();
    setBusy(true);
    try {
      apply((await patchChatProfile(chat.id, patch)).chat);
      onDone();
      toast("Сохранено");
    } catch (err) {
      setBusy(false);
      toast(errorText(err, "Не удалось сохранить"), { error: true });
    }
  };

  const preview = (
    <Avatar
      size={120}
      name={title || chat.title || ""}
      color={avatarColor}
      image={avatarType === "image" ? avatarImage : avatarType === "sticker" ? avatarSticker?.url ?? undefined : undefined}
      emoji={avatarType === "emoji" ? avatarEmoji : undefined}
      sticker={avatarType === "sticker"}
    />
  );

  return (
    <>
      <div className={styles.head}>
        <div className={styles.avatarPick}>
          <button type="button" className={styles.avatarEdit} title="Сменить аватар" onClick={() => setOpenAvatar(true)}>
            {preview}
            <span className={styles.avatarIcon}>
              <Icon name="Image" size={40} />
            </span>
          </button>
          {(avatarImage || avatarEmoji || avatarSticker) && (
            <button type="button" className={styles.avatarClear} title="Убрать аватар" onClick={clearAvatar}>
              <Icon name="X" size={20} />
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          aria-label="Фото"
          onChange={(e) => {
            void pickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {openAvatar ? (
          <AvatarChoice onPick={(p) => {
            if (p.kind === "emoji") pickEmoji(p.emoji);
            else pickSticker(p.sticker, p.packId);
          }} onClose={() => setOpenAvatar(false)} />
        ) : null}
      </div>
      <Section>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>{isChannel ? "Название канала" : "Название группы"}</span>
            <TextField
              ref={titleInput}
              className={titleError ? styles.error : undefined}
              value={title}
              maxLength={128}
              aria-invalid={titleError || undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError(false);
              }}
            />
          </label>
          <label className={styles.field}>
            <span>Описание</span>
            <textarea className={styles.textarea} value={description} maxLength={255} rows={3} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </Section>
      <Section>
        <NavRow icon={isChannel ? "Send" : "Users"} color="blue" title={isChannel ? "Тип канала" : "Тип группы"} right={chat.isPublic ? "Публичный" : "Частный"} onClick={() => onOpen("type")} />
        <NavRow icon="Link" color="orange" title="Пригласительные ссылки" right={chat.approveJoins ? "по заявкам" : null} onClick={() => onOpen("invite")} />
        {isChannel ? (
          <NavRow icon="Smile" color="pink" title="Реакции" right={reactions ? String(reactions.length) : "Все"} onClick={() => onOpen("reactions")} />
        ) : permissions ? (
          <NavRow icon="Lock" color="purple" title="Права участников" right={chat.slowModeSeconds ? "медленный режим" : null} onClick={() => onOpen("permissions")} />
        ) : null}
        {isChannel ? (
          <NavRow icon="MessageSquare" color="green" title="Обсуждение" right={chat.linkedDiscussionChatId ? "Вкл." : "Выкл."} onClick={() => onOpen("discussion")} />
        ) : (
          <NavRow icon="MessageSquare" color="green" title="Приветствие" right={chat.welcomeText ? "Вкл." : "Выкл."} onClick={() => onOpen("welcome")} />
        )}
      </Section>
      <Section>
        {isChannel ? (
          <ToggleRow title="Подписывать посты" subtitle="Под постом будет имя автора" checked={!!chat.signMessages} onChange={(v) => void saveSetting({ signMessages: v })} />
        ) : null}
        {isChannel ? (
          <ToggleRow
            title="Комментарии"
            subtitle={
              !chat.linkedDiscussionChatId ? "Включение создаст группу обсуждения" : chat.commentsOff ? "Под постами комментариев нет" : "Под постами можно оставлять комментарии"
            }
            checked={!!chat.linkedDiscussionChatId && !chat.commentsOff}
            onChange={(v) => void toggleComments(v)}
          />
        ) : null}
        <NavRow icon="User" color="blue" title="Заявки на вступление" right={requests?.length ? String(requests.length) : null} onClick={() => onOpen("requests")} />
        <NavRow icon="Shield" color="red" title="Заблокированные" right={banned?.length ? String(banned.length) : null} onClick={() => onOpen("banned")} />
        <NavRow icon="Clock" color="grey" title="Недавние действия" onClick={() => onOpen("log")} />
        {chat.type === "channel" && channelStory ? (
          <NavRow icon="Image" color="purple" title="Добавить историю канала" right={channelStory.progress} onClick={channelStory.open} />
        ) : null}
      </Section>
      {colors?.length ? (
        <Section name="Цвет" caption="Новые цвета открываются с уровнями бустов.">
          <div className={styles.colors}>
            {colors.map((c) => (
              <button
                key={c.hex}
                type="button"
                className={avatarColor === c.hex ? `${styles.swatch} ${styles.swatchOn}` : styles.swatch}
                style={{ background: c.hex }}
                title={c.unlocked ? c.name : `${c.name} — с ${c.level}-го уровня`}
                aria-pressed={avatarColor === c.hex}
                onClick={() => (c.unlocked ? setAvatarColor(c.hex) : toast(`Цвет «${c.name}» открывается на ${c.level}-м уровне бустов`))}
              >
                {c.unlocked ? null : <Icon name="Lock" size={11} />}
              </button>
            ))}
          </div>
        </Section>
      ) : null}
      <Button className={styles.save} disabled={busy} onClick={() => void save()}>
        Сохранить
      </Button>
    </>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { chatQueries, type ChatSummary } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { Avatar, Button, Icon, TextField, toast } from "@/shared/ui";

import { type ChatProfilePatch, editChatQueries, patchChatProfile, setChatDiscussion } from "../api/edit-chat";
import { allowedReactions } from "../lib/chat-fields";
import { useApplyChat } from "../model/use-apply-chat";
import { useSaveSetting } from "../model/use-save-setting";

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

type Props = { chat: ChatSummary; onClose: () => void };

/** «Изменить группу/канал» вместо информации о чате — как public/js/components/editChatDialog.js. */
export function EditChatPanel({ chat, onClose }: Props) {
  const [page, setPage] = useState<Page>("main");
  const isChannel = chat.type === "channel";
  const back = () => setPage("main");
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
          <MainPage chat={chat} onOpen={setPage} onDone={onClose} />
        </div>
        {page === "type" ? <TypePage {...props} /> : null}
        {page === "invite" ? <InvitePage {...props} /> : null}
        {page === "permissions" ? <PermissionsPage {...props} /> : null}
        {page === "welcome" ? <WelcomePage {...props} /> : null}
        {page === "requests" ? <RequestsPage {...props} /> : null}
        {page === "banned" ? <BannedPage {...props} /> : null}
        {page === "reactions" ? <ReactionsPage chat={chat} /> : null}
        {page === "discussion" ? <DiscussionPage chat={chat} /> : null}
        {page === "log" ? <AdminLogPage chat={chat} /> : null}
      </div>
    </>
  );
}

function MainPage({ chat, onOpen, onDone }: { chat: ChatSummary; onOpen: (p: Page) => void; onDone: () => void }) {
  const isChannel = chat.type === "channel";
  const apply = useApplyChat(chat.id);
  const saveSetting = useSaveSetting(chat);
  const [title, setTitle] = useState(chat.title ?? "");
  const [description, setDescription] = useState(chat.description ?? "");
  const [avatarImage, setAvatarImage] = useState<string | null>(chat.avatarImage ?? null);
  const [avatarColor, setAvatarColor] = useState<string | null>(chat.avatarColor ?? null);
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

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatarImage(await fileToImageDataUrl(file, 512));
    } catch (err) {
      toast(errorText(err, "Не удалось прочитать изображение"), { error: true });
    }
  };

  const save = async () => {
    const t = title.trim();
    if (!t) {
      setTitleError(true);
      titleInput.current?.focus();
      return;
    }
    // Отправляем только изменённое — иначе сервер пишет в чат «удалил фото», которого не было.
    const patch: ChatProfilePatch = {};
    if (t !== (chat.title ?? "")) patch.title = t;
    if (description.trim() !== (chat.description ?? "")) patch.description = description.trim();
    if (avatarImage !== (chat.avatarImage ?? null)) patch.avatarImage = avatarImage;
    if (avatarColor !== (chat.avatarColor ?? null)) patch.avatarColor = avatarColor;
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

  return (
    <>
      <div className={styles.head}>
        <button type="button" className={styles.avatarEdit} title="Сменить фото" onClick={() => fileInput.current?.click()}>
          <Avatar size={120} name={title || chat.title || ""} color={avatarColor} image={avatarImage} />
          <span className={styles.avatarIcon}>
            <Icon name="Image" size={40} />
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          aria-label="Фото"
          onChange={(e) => {
            void pickAvatar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
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
        {/* Комментарии одним переключателем: группа обсуждения при выключении остаётся
            привязанной со всей перепиской — включить обратно можно тут же. */}
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

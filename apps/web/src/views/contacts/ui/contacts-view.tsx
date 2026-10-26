import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { AddContactPanel, type ContactItem, contactsQueries, ImportContactsDialog, useContactActions, useWriteTo } from "@/features/manage-contacts";

import { useSession } from "@/entities/session";
import { isBirthdayToday, openUserProfile, ProfileStatusBadge, userQueries } from "@/entities/user";

import { statusLabel } from "@/shared/lib/presence";
import { useCloseSidePanel } from "@/shared/lib/side-panel";
import { Avatar, Icon, type IconName, TextField } from "@/shared/ui";

import styles from "./contacts-view.module.css";

const SORT_KEY = "shalter_contacts_sort";
type SortMode = "seen" | "name";

const digits = (raw: string | null | undefined) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("8") ? `7${d.slice(1)}` : d;
};

const displayName = (c: ContactItem) => c.localName || c.user.name;

// Как в Telegram: сначала те, кто в сети, потом по времени последнего визита.
const seenRank = (u: ContactItem["user"]) => (u.online ? "9" : u.lastSeen ? `1${u.lastSeen}` : "0");

function readSort(): SortMode {
  try {
    return localStorage.getItem(SORT_KEY) === "name" ? "name" : "seen";
  } catch {
    return "seen";
  }
}

/** /contacts — public/js/views/contacts.js: добавление, поиск по своим, дни рождения, действия в строке. */
export function ContactsView() {
  const close = useCloseSidePanel();
  const navigate = useNavigate();
  const client = useQueryClient();
  const blocked = useSession().data?.user?.blockedUserIds ?? [];
  const contactsQuery = useQuery(contactsQueries.list());
  const contacts = contactsQuery.data ?? [];
  const actions = useContactActions();
  const writeTo = useWriteTo();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSortState] = useState<SortMode>(readSort);

  const setSort = (mode: SortMode) => {
    setSortState(mode);
    try {
      localStorage.setItem(SORT_KEY, mode);
    } catch {
      // Без хранилища порядок просто не запомнится.
    }
  };

  const q = filter.trim().toLowerCase();
  const sorted = [...contacts].sort((a, b) => (sort === "seen" ? seenRank(b.user).localeCompare(seenRank(a.user)) : 0) || displayName(a).localeCompare(displayName(b), "ru"));
  const shown = q
    ? sorted.filter((c) => {
        const qDigits = digits(q);
        return (
          displayName(c).toLowerCase().includes(q) ||
          c.user.name.toLowerCase().includes(q) ||
          (c.user.profileName ?? "").toLowerCase().includes(q) ||
          (c.user.username ?? "").toLowerCase().includes(q.replace(/^@/, "")) ||
          (qDigits.length >= 3 && digits(c.user.phone).includes(qDigits))
        );
      })
    : sorted;
  // Дни рождения сегодня — отдельным блоком сверху, как в Telegram.
  const birthdays = q ? [] : shown.filter((c) => c.user.birthday && isBirthdayToday(c.user.birthday));
  const write = (c: ContactItem) => void writeTo(c.user);
  const onImported = () => void client.invalidateQueries({ queryKey: userQueries.contacts().queryKey });

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <button type="button" className={styles.back} title="Назад" aria-label="Назад" onClick={close}>
          <Icon name="ChevronLeft" size={20} />
        </button>
        <h1 className={styles.title}>Контакты</h1>
        <button type="button" className={styles.iconButton} title="Люди рядом" aria-label="Люди рядом" onClick={() => void navigate("/nearby")}>
          <Icon name="MapPin" size={18} />
        </button>
        <button type="button" className={styles.iconButton} title="Найти друзей из контактов телефона" aria-label="Найти друзей из контактов телефона" onClick={() => setImporting(true)}>
          <Icon name="Users" size={18} />
        </button>
        <button type="button" className={styles.pill} onClick={() => setAdding((a) => !a)}>
          <Icon name="Plus" size={15} /> Добавить
        </button>
      </header>
      {adding ? <AddContactPanel contacts={contacts} onAdded={() => setAdding(false)} /> : null}
      {contacts.length ? <TextField type="search" className={styles.filter} placeholder="Поиск по имени или номеру" value={filter} onChange={(e) => setFilter(e.target.value)} /> : null}
      <div className={styles.list}>
        {contactsQuery.isPending ? null : contacts.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyHint}>Список контактов пуст</p>
            <button type="button" className={styles.accentButton} onClick={() => setImporting(true)}>
              Найти друзей из контактов
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className={styles.emptyHint}>По запросу «{filter.trim()}» никого нет</p>
        ) : (
          <>
            {birthdays.length ? (
              <>
                <p className={styles.section}>🎂 Сегодня день рождения</p>
                {birthdays.map((c) => (
                  <div key={c.userId} className={styles.row}>
                    <button type="button" className={styles.profileButton} onClick={() => openUserProfile(c.userId)}>
                      <span aria-hidden="true">
                        <Avatar name={displayName(c)} color={c.user.avatarColor} image={c.user.avatarImage} online={c.user.online} size={54} />
                      </span>
                      <span className={styles.body}>
                        <span className={styles.name}>{displayName(c)}</span> <span className={styles.status}>Поздравьте!</span>
                      </span>
                    </button>
                    <button type="button" className={styles.pill} onClick={() => write(c)}>
                      Написать
                    </button>
                  </div>
                ))}
              </>
            ) : null}
            <div className={styles.listHead}>
              <p className={styles.section}>{q ? `Найдено — ${shown.length}` : `Контакты — ${shown.length}`}</p>
              <button type="button" className={styles.sortButton} title="Сортировка" onClick={() => setSort(sort === "seen" ? "name" : "seen")}>
                {sort === "seen" ? "по времени входа" : "по имени"}
              </button>
            </div>
            {shown.map((c) => (
              <ContactRow
                key={c.userId}
                contact={c}
                blocked={blocked.includes(c.userId)}
                onOpen={() => openUserProfile(c.userId)}
                onRename={() => void actions.rename(c)}
                onWrite={() => write(c)}
                onToggleBlock={() => void actions.toggleBlock(c.userId)}
                onRemove={() => void actions.remove(c.userId)}
              />
            ))}
          </>
        )}
      </div>
      {importing ? <ImportContactsDialog onAdded={onImported} onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

type RowProps = {
  contact: ContactItem;
  blocked: boolean;
  onOpen: () => void;
  onRename: () => void;
  onWrite: () => void;
  onToggleBlock: () => void;
  onRemove: () => void;
};

function ContactRow({ contact: c, blocked, onOpen, onRename, onWrite, onToggleBlock, onRemove }: RowProps) {
  const user = c.user;
  const status = statusLabel(user);
  return (
    // Группа с именем контакта связывает кнопки действий со своей строкой.
    <div className={styles.row} role="group" aria-label={displayName(c)}>
      <button type="button" className={styles.profileButton} onClick={onOpen}>
        {/* Аватар не входит в имя кнопки: «имя + статус», как у строки в старом клиенте. */}
        <span aria-hidden="true">
          <Avatar name={displayName(c)} color={user.avatarColor} image={user.avatarImage} online={user.online} size={54} />
        </span>
        <span className={styles.body}>
          <span className={styles.name}>
            {/* Имя — отдельным элементом: голый текст во flex-строке не сжимается с многоточием. */}
            <span className={styles.nameText} translate="no">
              {displayName(c)}
            </span>
            {user.mutualContact ? (
              <span className={styles.mutual} title="Взаимный контакт — вы есть друг у друга в контактах">
                ⇄
              </span>
            ) : null}
            {user.isVerified ? (
              <span className={styles.verified} title="Подтверждённый аккаунт">
                <Icon name="Verified" size={13} />
              </span>
            ) : null}
            <ProfileStatusBadge user={user} size={13} />
          </span>{" "}
          <span className={status === "в сети" ? `${styles.status} ${styles.online}` : styles.status}>{status ?? (user.username ? `@${user.username}` : "был(а) недавно")}</span>
        </span>
      </button>
      <RowAction icon="Edit" size={15} label="Переименовать у себя" onClick={onRename} />
      <RowAction icon="Send" label="Написать" onClick={onWrite} />
      <RowAction icon="Lock" label={blocked ? "Разблокировать" : "Заблокировать"} danger={!blocked} active={blocked} onClick={onToggleBlock} />
      <RowAction icon="Trash" label="Удалить из контактов" danger onClick={onRemove} />
    </div>
  );
}

function RowAction({ icon, size = 16, label, danger, active, onClick }: { icon: IconName; size?: number; label: string; danger?: boolean; active?: boolean; onClick: () => void }) {
  const cls = [styles.rowAction, danger ? styles.dangerAction : "", active ? styles.blockedAction : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} size={size} />
    </button>
  );
}

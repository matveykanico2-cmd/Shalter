import { useEffect, useRef, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { publicUrl } from "@/shared/lib/public-link";
import { Avatar, PhoneField, TextField } from "@/shared/ui";

import { type ContactItem, findUserByUsername, type FoundUser, matchContacts } from "../api/contacts";
import { inviteText } from "../lib/invite";
import { useContactActions } from "../model/use-contact-actions";

import styles from "./manage-contacts.module.css";

type Props = { contacts: readonly ContactItem[]; onAdded: () => void };

type Candidate = { id: string; name: string; username?: string | null; avatarColor?: string | null; avatarImage?: string | null };

const NAME_DRAFT_KEY = "contact-add-name-draft";

const digits = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("8") ? `7${d.slice(1)}` : d;
};

function readDraft() {
  try {
    return sessionStorage.getItem(NAME_DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(NAME_DRAFT_KEY);
    else sessionStorage.setItem(NAME_DRAFT_KEY, value);
  } catch {
    // Без хранилища черновик имени просто не переживёт перезагрузку.
  }
}

/**
 * «Добавить» на экране контактов — как contacts-add-panel в public/js/views/contacts.js:
 * по номеру (имя «как в телефонной книге») или по точному @юзернейму.
 */
export function AddContactPanel({ contacts, onAdded }: Props) {
  const actions = useContactActions();
  const [mode, setMode] = useState<"phone" | "username">("phone");
  const [name, setName] = useState(readDraft);
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setResult(null);
    setError(null);
    setNotRegistered(null);
  };

  // Поиск по нику — когда набор затих на 400 мс; устаревший ответ не показываем.
  useEffect(() => {
    if (mode !== "username") return;
    const handle = query.trim().replace(/^@/, "");
    if (handle.length < 3) return;
    let stale = false;
    const timer = setTimeout(() => {
      setSearching(true);
      findUserByUsername(handle)
        .then(
          ({ user }: { user: FoundUser }) => {
            if (stale) return;
            if (user.isSelf) setError("Это вы");
            else if (contacts.some((c) => c.userId === user.id)) setError("Уже в контактах");
            else setResult(user);
          },
          () => {
            if (!stale) setError("Пользователь не найден");
          }
        )
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [mode, query, contacts]);

  const lookUpPhone = async () => {
    reset();
    if (digits(phone).length < 10) return setError("Введите номер полностью");
    setSearching(true);
    try {
      const { found, notFound } = await matchContacts([{ phone, name: name.trim() }]);
      const entry = found[0];
      if (entry) {
        if (entry.alreadyContact) setError("Уже в контактах");
        else setResult(entry.user);
      } else setNotRegistered(notFound[0]?.phone ?? phone);
    } catch (err) {
      setError(errorText(err, "Не удалось проверить номер"));
    } finally {
      setSearching(false);
    }
  };

  const confirmAdd = async (u: Candidate) => {
    try {
      await actions.add(u.id, mode === "phone" ? name.trim() || null : null);
    } catch (err) {
      setError(errorText(err, "Не удалось добавить контакт"));
      return;
    }
    writeDraft(null);
    onAdded();
  };

  const invite = async () => {
    try {
      if (navigator.share) await navigator.share({ text: inviteText() });
      else await navigator.clipboard.writeText(inviteText());
    } catch {
      // Отменили «Поделиться» — всё равно показываем ссылку.
    }
    setInviteCopied(true);
  };

  const switchMode = (next: "phone" | "username") => {
    setMode(next);
    reset();
    setTimeout(() => (next === "phone" ? nameRef : queryRef).current?.focus());
  };

  return (
    <div className={styles.addPanel}>
      <div className={styles.modes}>
        <button type="button" className={mode === "phone" ? `${styles.mode} ${styles.modeActive}` : styles.mode} onClick={() => switchMode("phone")}>
          По номеру
        </button>
        <button type="button" className={mode === "username" ? `${styles.mode} ${styles.modeActive}` : styles.mode} onClick={() => switchMode("username")}>
          По юзернейму
        </button>
      </div>
      {mode === "phone" ? (
        <>
          <p className={styles.hint}>Как в телефонной книге: имя, под которым записать, и номер. Имя видите только вы.</p>
          <TextField
            ref={nameRef}
            placeholder="Имя (как записать у себя)"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              writeDraft(e.target.value);
            }}
          />
          <div className={styles.phoneRow}>
            <PhoneField
              onChange={(v) => {
                setPhone(v);
                reset();
              }}
              onEnter={() => void lookUpPhone()}
            />
            <button type="button" className={styles.pill} onClick={() => void lookUpPhone()}>
              Найти
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.hint}>Введите точный @юзернейм — по имени искать нельзя, чтобы случайно не добавить незнакомца.</p>
          <TextField
            ref={queryRef}
            autoFocus
            placeholder="@юзернейм"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
          />
        </>
      )}
      <div className={styles.candidates}>
        {searching ? <p className={styles.emptyHint}>Ищем…</p> : null}
        {error ? <p className={styles.emptyHint}>{error}</p> : null}
        {result ? (
          <button type="button" className={styles.candidate} onClick={() => void confirmAdd(result)}>
            <Avatar name={result.name} color={result.avatarColor} image={result.avatarImage} size={32} />
            <span className={styles.candidateName}>{result.name}</span>
            {result.username ? <span className={styles.candidateUsername}>@{result.username}</span> : null}
          </button>
        ) : null}
        {notRegistered ? (
          <>
            <p className={styles.emptyHint}>На номере {notRegistered} никого нет в Shalter</p>
            <button type="button" className={styles.accentButton} onClick={() => void invite()}>
              Пригласить в Shalter
            </button>
            {inviteCopied ? <p className={styles.hint}>Приглашение скопировано: {publicUrl("/login")}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

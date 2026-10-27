import { useRef, useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Button, Dialog, Icon } from "@/shared/ui";

import { addContact, type PhoneEntry } from "../api/contacts";
import { canReadPhoneBook, matchAndAddAll, readPhoneBook, type SyncedFound } from "../lib/contact-sync";
import { inviteText } from "../lib/invite";
import { isContactPickerSupported, isIos, parsePastedContacts, pickPhoneContacts, readVCardFiles } from "../lib/phone-contacts";

import styles from "./manage-contacts.module.css";

type Props = { onAdded: () => void; onClose: () => void };

type Results = { found: SyncedFound[]; notFound: PhoneEntry[]; checked: number; added: number };

const INVITE_LIMIT = 100;

/**
 * «Друзья из контактов» — public/js/components/importContactsDialog.js: найденных сразу в контакты,
 * остальных пригласить. Номера — из книги (приложение или Contact Picker), файлов .vcf или вставкой.
 */
export function ImportContactsDialog({ onAdded, onClose }: Props) {
  const [step, setStep] = useState<"pick" | "loading" | "results">("pick");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [pasted, setPasted] = useState("");
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(new Set());
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const picker = canReadPhoneBook() || isContactPickerSupported();

  const match = async (entries: PhoneEntry[]) => {
    setStep("loading");
    setError(null);
    try {
      // Как в Telegram: всех найденных — сразу в контакты, без «Добавить» у каждого.
      const res = await matchAndAddAll(entries);
      if (res.added) onAdded();
      setResults(res);
      setStep("results");
    } catch (err) {
      setError(errorText(err, "Не удалось проверить контакты"));
      setStep("pick");
    }
  };

  const pickFromBook = async () => {
    setError(null);
    try {
      const entries = canReadPhoneBook() ? await readPhoneBook() : await pickPhoneContacts();
      if (entries.length) await match(entries);
    } catch (err) {
      setError(errorText(err, "Не удалось получить доступ к контактам"));
    }
  };

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    const entries = await readVCardFiles(files);
    if (!entries.length) return setError("В файлах не нашлось ни одного номера телефона");
    await match(entries);
  };

  const matchPasted = async () => {
    const entries = parsePastedContacts(pasted);
    if (!entries.length) return setError("Не нашлось ни одного номера — по одному в строке или через запятую");
    await match(entries);
  };

  const add = async (entry: SyncedFound) => {
    if (busyId) return;
    setBusyId(entry.user.id);
    try {
      await addContact(entry.user.id, entry.localName || null);
      setAddedIds((s) => new Set(s).add(entry.user.id));
      onAdded();
    } catch (err) {
      setError(errorText(err, "Не удалось добавить контакт"));
    } finally {
      setBusyId(null);
    }
  };

  const invite = async (entry: PhoneEntry) => {
    setInvited((s) => new Set(s).add(entry.phone));
    if (navigator.share) {
      try {
        await navigator.share({ text: inviteText() });
        return;
      } catch {
        // Отменили «Поделиться» — предлагаем SMS.
      }
    }
    window.location.assign(`sms:${entry.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(inviteText())}`);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteText());
      setError(null);
      setNotice("Приглашение скопировано ✓");
    } catch {
      setNotice("Не удалось скопировать — выделите ссылку вручную");
    }
  };

  return (
    <Dialog title="Друзья из контактов" onClose={onClose} className={styles.importDialog}>
      <div className={styles.importBody}>
        {step === "loading" ? (
          <>
            <span className={styles.spinner} />
            <p className={styles.hint}>Ищем ваших друзей…</p>
          </>
        ) : step === "pick" ? (
          <>
            <p className={styles.hint}>Найдём, кто из ваших контактов уже в Shalter, а остальных можно пригласить. Номера проверяются на сервере и нигде не сохраняются.</p>
            {picker ? <Button onClick={() => void pickFromBook()}>{canReadPhoneBook() ? "Найти друзей из контактов телефона" : "Выбрать из контактов телефона"}</Button> : null}
            <button type="button" className={`${styles.actionButton} ${styles.vcfButton}`} onClick={() => fileInput.current?.click()}>
              <Icon name="Download" size={15} /> Выбрать файлы контактов (.vcf)
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".vcf,text/vcard,text/x-vcard"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void onFiles(files);
              }}
            />
            <p className={styles.hint}>
              {picker
                ? "Файл подойдёт, если хотите проверить контакты с другого устройства."
                : isIos()
                  ? "На iPhone Safari не даёт странице доступ к адресной книге — это ограничение самой iOS, а не приложения. Два рабочих способа: в «Контактах» выделите людей → «Поделиться» → сохраните карточки в «Файлы» и выберите их здесь (можно сразу несколько), либо просто вставьте номера ниже."
                  : "Ваш браузер не даёт странице доступ к адресной книге напрямую. Экспортируйте контакты в файл .vcf (Android: Контакты → Экспорт) и выберите его здесь — или вставьте номера ниже."}
            </p>
            <p className={styles.fieldLabel}>Или вставьте номера</p>
            <textarea className={styles.paste} rows={3} placeholder={"+7 999 111-22-33\nМама +7 900 000 00 00"} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <button type="button" className={styles.actionButton} onClick={() => void matchPasted()}>
              Проверить эти номера
            </button>
            {error ? <p className={styles.error}>{error}</p> : null}
          </>
        ) : results ? (
          <>
            <p className={styles.hint}>
              Проверено номеров: {results.checked}
              {results.added ? ` · добавлено в контакты: ${results.added}` : ""}
            </p>
            {error ? <p className={styles.error}>{error}</p> : null}
            <p className={styles.sectionTitle}>Уже в Shalter ({results.found.length})</p>
            {results.found.length ? (
              <div className={styles.importList}>
                {results.found.map((entry) => {
                  const u = entry.user;
                  const done = addedIds.has(u.id) || entry.alreadyContact || entry.justAdded;
                  const sub = entry.localName && entry.localName !== u.name ? `${entry.localName} · @${u.username}` : u.username ? `@${u.username}` : "";
                  return (
                    <div key={u.id} className={styles.importRow}>
                      <Avatar name={u.name} color={u.avatarColor} image={u.avatarImage} size={36} online={u.online} />
                      <div className={styles.importText}>
                        <p className={styles.importName}>{u.name}</p>
                        {sub ? <p className={styles.importSub}>{sub}</p> : null}
                      </div>
                      {done ? (
                        <span className={styles.importDone}>{entry.alreadyContact ? "уже в контактах" : "добавлен ✓"}</span>
                      ) : (
                        <button type="button" className={styles.pill} disabled={busyId === u.id} onClick={() => void add(entry)}>
                          {busyId === u.id ? "…" : "Добавить"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={styles.muted}>Никого из ваших контактов здесь пока нет</p>
            )}
            <p className={styles.sectionTitle}>Пригласить ({results.notFound.length})</p>
            {results.notFound.length ? (
              <div className={styles.importList}>
                {results.notFound.slice(0, INVITE_LIMIT).map((entry) => (
                  <div key={entry.phone} className={styles.importRow}>
                    <span className={styles.importPlaceholder}>
                      <Icon name="Users" size={16} />
                    </span>
                    <div className={styles.importText}>
                      <p className={styles.importName}>{entry.name || entry.phone}</p>
                      {entry.name ? <p className={`${styles.importSub} ${styles.mono}`}>{entry.phone}</p> : null}
                    </div>
                    <button type="button" className={invited.has(entry.phone) ? `${styles.pill} ${styles.pillMuted}` : styles.pill} onClick={() => void invite(entry)}>
                      {invited.has(entry.phone) ? "Отправлено" : "Пригласить"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.muted}>Все ваши контакты уже здесь</p>
            )}
            {results.notFound.length > INVITE_LIMIT ? (
              <p className={styles.hint}>
                …и ещё {results.notFound.length - INVITE_LIMIT}. Показаны первые {INVITE_LIMIT}.
              </p>
            ) : null}
            {results.notFound.length ? (
              <button type="button" className={styles.actionButton} onClick={() => void copyInvite()}>
                Скопировать текст приглашения
              </button>
            ) : null}
            {notice ? <p className={styles.hint}>{notice}</p> : null}
          </>
        ) : null}
      </div>
      <Button variant="secondary" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}

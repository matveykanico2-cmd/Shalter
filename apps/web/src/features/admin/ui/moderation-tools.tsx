import { useState } from "react";
import { useNavigate } from "react-router";

import { errorText } from "@/shared/lib/error-text";
import { askText, Icon, SettingsSection, TextField } from "@/shared/ui";

import {
  type AdminUser,
  bulkDelete,
  deleteBot,
  deleteChat,
  type DirectoryItem,
  type DirectoryTab,
  type FoundChat,
  loadDirectory,
  lookupChat,
  type MailStatus,
  mailStatus,
} from "../api/admin";

import styles from "./admin.module.css";

// Поиск группы/канала/бота, каталог и проверка почты — части renderModeration.

/** «Группа, канал или бот»: найти и удалить за нарушение правил. */
export function ChatLookup() {
  const [value, setValue] = useState("");
  const [found, setFound] = useState<FoundChat | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const lookup = async () => {
    const q = value.trim();
    setMessage(null);
    setFound(null);
    if (!q) return;
    try {
      setFound((await lookupChat(q)).chat);
    } catch (err) {
      setMessage(errorText(err, "Группа, канал или бот не найдены"));
    }
  };

  const remove = async (c: FoundChat) => {
    const what = c.type === "channel" ? "канал" : c.type === "bot" ? "бота" : "группу";
    const who = c.type === "bot" ? `${c.members} диалогов` : `${c.members} участников`;
    const reason = (await askText(`Удалить ${what} «${c.title}» (${who}) за нарушение правил? Это необратимо.\n\nПричина — придёт владельцу и попадёт в журнал:`, { okLabel: "OK" }))?.trim();
    if (!reason) return;
    setDeleting(true);
    try {
      if (c.type === "bot") await deleteBot(c.id, reason);
      else await deleteChat(c.id, reason);
      setFound(null);
      setMessage(`«${c.title}» удалён${c.type === "group" ? "а" : ""}.`);
    } catch (err) {
      setMessage(errorText(err, "Не удалось удалить"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SettingsSection title="Группа, канал или бот">
      <div className={styles.body}>
        <TextField
          placeholder="@канал, @бот, ссылка-приглашение или id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void lookup();
          }}
        />
        <button type="button" className={styles.accent} onClick={() => void lookup()}>
          Найти
        </button>
        {message ? <p className={found ? styles.error : styles.hint}>{message}</p> : null}
        {found ? (
          <div className={styles.box}>
            <p className={styles.boxTitle}>{`${{ channel: "Канал", bot: "Бот", group: "Группа" }[found.type]} «${found.title}»`}</p>
            <p className={styles.hint}>
              {[
                found.username ? `@${found.username}` : null,
                found.type === "bot" ? `${found.members} диалогов` : `${found.members} участников`,
                found.owner ? `владелец — ${found.owner.name}${found.owner.username ? ` (@${found.owner.username})` : ""}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <button type="button" className={styles.dangerLink} disabled={deleting} onClick={() => void remove(found)}>
              {deleting ? "Удаляем…" : "Удалить за нарушение правил"}
            </button>
          </div>
        ) : null}
        <p className={styles.hint}>Сообщения, файлы, ссылки и истории удаляются прямо в чате или в просмотре истории — модератору там доступно «Удалить у всех».</p>
      </div>
    </SettingsSection>
  );
}

const DIR_TABS: [DirectoryTab, string][] = [
  ["users", "Люди"],
  ["groups", "Группы"],
  ["channels", "Каналы"],
  ["bots", "Боты"],
];
const KIND_WORDS: Record<string, [string, string]> = { group: ["группу", "групп"], channel: ["канал", "каналов"], bot: ["бота", "ботов"] };
const itemTitle = (it: DirectoryItem) => ("title" in it ? it.title : it.name);
const deletable = (it: DirectoryItem) => it.kind !== "user" && !("isSystem" in it && it.isSystem);

/** «Каталог»: люди, группы, каналы и боты с массовым удалением. */
export function Directory({ onOpenUser }: { onOpenUser: (u: AdminUser) => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<DirectoryTab>("users");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<DirectoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, DirectoryItem>>(new Map());
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);

  const load = async (t = tab) => {
    setLoading(true);
    setSelected(new Map());
    try {
      const r = await loadDirectory(t, query.trim());
      setItems(r.items);
      setTotal(r.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Удаление из каталога: одной строки или всех отмеченных, с общей причиной.
  const remove = async (list: DirectoryItem[]) => {
    if (!list.length || deleting) return;
    const [first] = list;
    const label =
      list.length === 1 && first
        ? `${KIND_WORDS[first.kind]?.[0]} «${itemTitle(first)}»`
        : `${list.length} шт. (${[...new Set(list.map((i) => KIND_WORDS[i.kind]?.[1]))].join(", ")})`;
    const reason = (
      await askText(`Удалить ${label} за нарушение правил? Это необратимо: пропадут вся переписка и файлы, у канала — и группа обсуждения.\n\nПричина — придёт владельцам и попадёт в журнал:`, {
        okLabel: "OK",
      })
    )?.trim();
    if (!reason) return;
    setDeleting(true);
    setNotice(null);
    try {
      const { deleted, failed } = await bulkDelete(
        list.map((i) => ({ id: i.id, kind: i.kind })),
        reason
      );
      const gone = new Set(deleted.map((d) => d.id));
      setItems((prev) => (prev ?? []).filter((i) => !gone.has(i.id)));
      setTotal((t) => Math.max(0, t - gone.size));
      setSelected((prev) => new Map([...prev].filter(([id]) => !gone.has(id))));
      setNotice({
        error: failed.length > 0,
        text: [deleted.length ? `Удалено: ${deleted.length}` : null, failed.length ? `Не удалось: ${failed.map((f) => `${f.id} — ${f.error}`).join("; ")}` : null].filter(Boolean).join(". "),
      });
    } catch (err) {
      setNotice({ error: true, text: errorText(err, "Не удалось удалить") });
    } finally {
      setDeleting(false);
    }
  };

  const toggle = (it: DirectoryItem, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(it.id, it);
      else next.delete(it.id);
      return next;
    });

  const rowBody = (it: DirectoryItem) =>
    !("title" in it) ? (
      <button type="button" className={styles.row} onClick={() => onOpenUser(it)}>
        <span className={styles.rowBody}>
          <span className={styles.rowName}>
            {it.name || "—"}
            {it.isBanned ? <span className={`${styles.flag} ${styles.flagDanger}`}>бан</span> : null}
            {it.kind === "bot" ? <span className={styles.tag}>бот</span> : null}
          </span>
          <span className={`${styles.rowMeta} ${styles.mono}`}>{[it.username ? `@${it.username}` : null, it.phone, it.email].filter(Boolean).join(" · ") || it.id}</span>
        </span>
      </button>
    ) : (
      <button type="button" className={styles.row} onClick={() => void navigate(`/chat/${it.id}`)}>
        <span className={styles.rowBody}>
          <span className={styles.rowName}>{it.title || "(без названия)"}</span>
          <span className={`${styles.rowMeta} ${styles.mono}`}>{[it.username ? `@${it.username}` : null, `${it.members} участн.`].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
    );

  const visible = (items ?? []).filter(deletable);
  const allOn = visible.length > 0 && visible.every((i) => selected.has(i.id));

  return (
    <SettingsSection title="Каталог">
      <div className={styles.body}>
        <div className={styles.chips}>
          {DIR_TABS.map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              className={tab === id ? `${styles.chip} ${styles.active}` : styles.chip}
              onClick={() => {
                setTab(id);
                setItems(null);
                void load(id);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className={styles.inline}>
          <TextField
            placeholder="Поиск в каталоге (необязательно)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
          <button type="button" className={styles.accent} onClick={() => void load()}>
            Показать
          </button>
        </div>
        {notice ? <p className={notice.error ? styles.error : styles.success}>{notice.text}</p> : null}
        {loading ? (
          <p className={styles.hint}>Загрузка…</p>
        ) : items == null ? (
          <p className={styles.hint}>Выберите вкладку и нажмите «Показать».</p>
        ) : !items.length ? (
          <p className={styles.empty}>Пусто</p>
        ) : (
          <div>
            <p className={styles.hint}>{total > items.length ? `Показано ${items.length} из ${total} — уточните поиск` : `Всего: ${total}`}</p>
            {visible.length ? (
              <div className={styles.inline}>
                <label className={styles.auto}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => setSelected(allOn ? new Map() : new Map(visible.map((i) => [i.id, i])))}
                  />
                  {selected.size ? `Выбрано: ${selected.size}` : "Выбрать все"}
                </label>
                {selected.size ? (
                  <button type="button" className={`${styles.pill} ${styles.dangerFill}`} disabled={deleting} onClick={() => void remove([...selected.values()])}>
                    {deleting ? "Удаляем…" : `Удалить выбранные (${selected.size})`}
                  </button>
                ) : null}
              </div>
            ) : null}
            {items.map((it) =>
              deletable(it) ? (
                <div key={it.id} className={selected.has(it.id) ? `${styles.rowWrap} ${styles.selected}` : styles.rowWrap}>
                  <input type="checkbox" aria-label={`Выбрать «${itemTitle(it)}»`} checked={selected.has(it.id)} onChange={(e) => toggle(it, e.target.checked)} />
                  {rowBody(it)}
                  <button type="button" className={`${styles.iconBtn} ${styles.danger}`} title="Удалить за нарушение правил" aria-label="Удалить за нарушение правил" disabled={deleting} onClick={() => void remove([it])}>
                    <Icon name="Trash" size={17} />
                  </button>
                </div>
              ) : (
                <div key={it.id}>{rowBody(it)}</div>
              )
            )}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

/** «Отправка почты»: вход на SMTP и DNS-записи домена. */
export function MailCheck() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      setStatus(await mailStatus());
    } catch (err) {
      setStatus({ from: "—", configured: true, ok: false, error: errorText(err, "не удалось проверить"), directEnabled: false, dns: { domain: null, ip: null, records: [] } });
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection title="Отправка почты">
      <div className={styles.body}>
        <p className={styles.hint}>
          Коды восстановления и подтверждение адреса уходят письмом. Проверка подключается к SMTP-серверу и входит под указанным ящиком — так видно, дело в пароле, в закрытом порте или в
          самом адресе.
        </p>
        <button type="button" className={styles.outline} disabled={busy} onClick={() => void check()}>
          {busy ? "Проверяем…" : "Проверить отправку"}
        </button>
        {status ? (
          <>
            <p className={`${styles.hint} ${styles.mono}`}>{`Отправитель: ${status.from}`}</p>
            {status.dns.records.length ? (
              <>
                <p className={styles.hint}>{`DNS домена ${status.dns.domain}${status.dns.ip ? ` (адрес сервера ${status.dns.ip})` : ""} — добавьте в редакторе DNS у регистратора:`}</p>
                {status.dns.records.map((r) => (
                  <div key={r.kind} className={styles.dnsRecord}>
                    <p className={styles.hint}>
                      <span className={r.published ? styles.dnsOk : styles.dnsTodo}>{r.published ? "✓ опубликована" : "нужно добавить"}</span>
                      {` ${r.kind} · тип TXT · имя `}
                      <span className={styles.mono}>{r.name}</span>
                    </p>
                    <textarea className={styles.dnsValue} rows={2} readOnly value={r.value} onClick={(e) => e.currentTarget.select()} />
                    <p className={styles.hint}>{r.note}</p>
                  </div>
                ))}
              </>
            ) : null}
            {status.configured ? (
              <p className={status.ok ? styles.success : styles.error}>{status.ok ? "SMTP настроен, вход выполнен — письма уходят." : `SMTP отвечает отказом: ${status.error}`}</p>
            ) : (
              <p className={styles.hint}>
                {status.directEnabled ? "SMTP не задан. Письма отдаются серверу получателя напрямую — mail.ru и yandex принимают, gmail отказывает." : "SMTP не задан, прямая отправка выключена — письма никуда не уходят."}
              </p>
            )}
          </>
        ) : null}
      </div>
    </SettingsSection>
  );
}

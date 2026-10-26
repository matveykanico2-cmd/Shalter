import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { SAFETY_LABELS, safetyLabelQueries } from "@/entities/safety-label";
import { type SelfUser, useSession } from "@/entities/session";

import { copyText } from "@/shared/lib/clipboard";
import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Dialog, Icon, TextField } from "@/shared/ui";

import {
  adminQueries,
  type AdminUser,
  deleteUser,
  deliverGift,
  exportUser,
  grantAds,
  grantBusiness,
  grantPremium,
  grantStars,
  type GrantTerm,
  resetPassword,
  setAdminSections,
  setBanned,
  setSafetyLabel,
  setVerified,
} from "../api/admin";
import { dateTime, downloadJson } from "../lib/format";

import styles from "./admin.module.css";
import { GiftPickDialog } from "./gift-pick-dialog";

// Карточка пользователя — openAdminUserPanel в public/js/components/adminUserPanel.js.

const ADMIN_SECTIONS = [
  { id: "moderation", label: "Модерация" },
  { id: "server", label: "Состояние сервера" },
  { id: "giftshop", label: "Каталог подарков" },
  { id: "emojicatalog", label: "Эмодзи" },
  { id: "pricing", label: "Цены" },
  { id: "donations", label: "DonationAlerts" },
  { id: "legal", label: "Запросы органов" },
];

type Duration = { label: string; term: GrantTerm };
const GRANT_DURATIONS: Duration[] = [
  { label: "30 дней", term: { days: 30 } },
  { label: "90 дней", term: { days: 90 } },
  { label: "365 дней", term: { days: 365 } },
  { label: "Навсегда", term: { forever: true } },
];
const ADS_DURATIONS: Duration[] = [
  { label: "30 дней", term: { days: 30 } },
  { label: "90 дней", term: { days: 90 } },
  { label: "Навсегда", term: { forever: true } },
];
// Срок блокировки, секунды; null — навсегда.
const BAN_DURATIONS: { label: string; sec: number | null }[] = [
  { label: "1 час", sec: 3600 },
  { label: "1 день", sec: 86400 },
  { label: "7 дней", sec: 7 * 86400 },
  { label: "30 дней", sec: 30 * 86400 },
  { label: "Навсегда", sec: null },
];

const STATUS_LABELS: Record<string, string> = {
  open: "открыта",
  resolved_deleted: "контент удалён",
  resolved_banned: "аккаунт заблокирован",
  dismissed: "отклонена",
};

function untilLabel(active?: boolean, forever?: boolean, until?: string | null) {
  if (!active) return "не активен";
  if (forever) return "навсегда";
  return until ? `активен до ${new Date(until).toLocaleDateString("ru-RU")}` : "активен";
}

type Props = { user: AdminUser; onClose: () => void };

export function UserCard({ user, onClose }: Props) {
  const me = useSession().data?.user;
  if (!me) return null;
  return <UserCardBody initial={user} me={me} onClose={onClose} />;
}

function UserCardBody({ initial, me, onClose }: { initial: AdminUser; me: SelfUser; onClose: () => void }) {
  const client = useQueryClient();
  const [state, setState] = useState<AdminUser>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(() => new Set(initial.adminSections ?? []));
  const [picking, setPicking] = useState(false);
  const [starsInput, setStarsInput] = useState("");
  const canGrantSections = !!me.isPrimaryAdmin;
  // Выдача покупок, звёзд и подарков — только полным админам (сервер проверяет телефон),
  // выгрузка данных — разделу «Запросы органов».
  const canGrantPurchases = !!me.isDeveloper;
  const canExport = !!me.isDeveloper || (me.adminSections ?? []).includes("legal");

  const reportsQuery = useQuery(adminQueries.userReports(initial.id));
  const labels = useQuery(safetyLabelQueries.list()).data;
  const gifts = useQuery({ ...adminQueries.giftShop(), enabled: canGrantPurchases }).data ?? [];

  // Свежая карточка с сервера дополняет то, что пришло из списка.
  const fresh = reportsQuery.data?.user;
  const [seen, setSeen] = useState(fresh);
  if (fresh && fresh !== seen) {
    setSeen(fresh);
    setState((s) => ({ ...s, ...fresh }));
    setPending(new Set(fresh.adminSections ?? []));
  }

  /** Действие с карточкой: patch — новые поля, notice — что сказать. Списки модерации обновляются. */
  const run = async (fn: () => Promise<{ patch?: Partial<AdminUser>; notice?: string } | void>, successNotice?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = (await fn()) ?? {};
      if (result.patch) setState((s) => ({ ...s, ...result.patch }));
      setNotice(result.notice ?? successNotice ?? null);
      void client.invalidateQueries({ queryKey: adminQueries.moderation().queryKey });
    } catch (err) {
      setError(errorText(err, "Не удалось выполнить действие"));
    } finally {
      setBusy(false);
    }
  };

  const premiumPatch = (u: Record<string, unknown>) => ({ isPremium: !!u.isPremium, premiumUntil: (u.premiumUntil as string) ?? null, premiumForever: !!u.premiumForever });
  const businessPatch = (u: Record<string, unknown>) => ({ isBusiness: !!u.isBusiness, businessUntil: (u.businessUntil as string) ?? null, businessForever: !!u.businessForever });
  const adsPatch = (u: Record<string, unknown>) => ({ isAdsActive: !!u.isAdsActive, adsUntil: (u.adsUntil as string) ?? null, adsForever: !!u.adsForever });

  const ban = async (d: (typeof BAN_DURATIONS)[number]) => {
    const reason = await askText(`Блокировка ${state.name}: ${d.label.toLowerCase()}.\nПричина — её пользователь увидит на экране блокировки.`, { okLabel: "OK" });
    if (reason == null || !reason.trim()) return;
    void run(async () => {
      const { user: updated } = await setBanned(state.id, true, reason.trim(), d.sec);
      return { patch: { ...updated, isBanned: true } };
    }, "Аккаунт заблокирован — пользователь уведомлён в чате с Shalter.");
  };

  const unban = () =>
    run(async () => {
      const { user: updated } = await setBanned(state.id, false);
      return { patch: updated };
    }, "Блокировка снята — пользователь уведомлён в чате с Shalter.");

  const setLabel = (label: string) =>
    run(
      async () => {
        const { user: updated } = await setSafetyLabel(state.id, label);
        return { patch: { safetyLabel: updated.safetyLabel ?? null } };
      },
      label ? "Метка установлена — она видна всем в профиле и в списке чатов." : "Метка снята."
    );

  const runExport = async () => {
    const reason = await askText(`Основание для выгрузки данных ${state.name} (номер дела / реквизиты постановления).\nОно будет записано в журнал выгрузок.`, { okLabel: "OK" });
    if (reason == null || !reason.trim()) return;
    void run(async () => {
      const { exportId, data } = await exportUser(state.id, reason.trim());
      downloadJson(data, `export_${state.username || state.id}_${exportId}.json`);
      return { notice: `Файл выгружен (${data.stats.messageCount} сообщений, чатов: ${data.stats.chatCount}). Запись в журнале: ${exportId}.` };
    });
  };

  const runResetPassword = async () => {
    const handle = state.username || state.id;
    const password = await askText(`Новый пароль для ${state.name} (не короче 6 символов):`, { okLabel: "OK" });
    if (password == null || password.length < 6) return;
    const typed = await askText(`Сбросить пароль ${state.name}?\n\nДля подтверждения введите @${handle}`, { okLabel: "OK" });
    if (typed == null) return;
    const reason = await askText("Основание — оно попадёт в журнал администрации:", { okLabel: "OK" });
    if (reason == null || !reason.trim()) return;
    const disableTwoFactor = state.twoFactorEnabled
      ? await askConfirm("У аккаунта включена двухфакторная аутентификация — без неё войти по новому паролю не выйдет.\n\nСнять её тоже?")
      : false;
    void run(async () => {
      const res = await resetPassword(state.id, { password, confirm: typed, reason: reason.trim(), disableTwoFactor });
      return { notice: res.twoFactorLifted ? "Пароль сброшен, 2FA снята" : "Пароль сброшен" };
    });
  };

  const runDelete = async () => {
    const handle = state.username || state.id;
    const typed = await askText(`Удалить аккаунт ${state.name} безвозвратно?\n\nДля подтверждения введите @${handle}`, { okLabel: "OK" });
    if (typed == null) return;
    const reason = await askText("Основание — оно попадёт в журнал администрации:", { okLabel: "OK" });
    if (reason == null || !reason.trim()) return;
    void run(async () => {
      await deleteUser(state.id, typed, reason.trim());
      onClose();
      return { notice: "Аккаунт удалён" };
    });
  };

  const durationRow = (list: Duration[], onPick: (d: Duration) => void) => (
    <div className={styles.chips}>
      {list.map((d) => (
        <button key={d.label} type="button" className={styles.chip} disabled={busy} onClick={() => onPick(d)}>
          {d.label}
        </button>
      ))}
    </div>
  );

  const labelShort = state.safetyLabel ? (labels?.find((l) => l.id === state.safetyLabel)?.short ?? SAFETY_LABELS[state.safetyLabel]?.short ?? state.safetyLabel) : null;
  const labelOptions = labels ? labels.map((l) => ({ id: l.id, label: l.label, hint: l.hint })) : Object.entries(SAFETY_LABELS).map(([id, l]) => ({ id, label: l.label, hint: l.hint }));
  const reports = reportsQuery.data?.reports;

  return (
    <Dialog title={`Управление: ${initial.name}`} onClose={onClose} className={styles.card}>
      <div className={styles.cardBody}>
        <p className={styles.cardSubtitle}>
          {state.username ? `@${state.username}` : state.id}
          {state.isBanned ? <span className={`${styles.flag} ${styles.flagDanger}`}>заблокирован</span> : null}
          {labelShort ? <span className={styles.flag}>{labelShort}</span> : null}
          {state.isVerified ? <span className={styles.flag}>верифицирован</span> : null}
        </p>
        {state.phone || state.email ? (
          <p className={styles.chips}>
            {[state.phone, state.email].filter((v): v is string => !!v).map((v) => (
              <button key={v} type="button" className={`${styles.chip} ${styles.mono}`} title="Скопировать" onClick={() => void copyText(v)}>
                {v}
              </button>
            ))}
          </p>
        ) : null}

        {canGrantPurchases ? (
          <>
            <p className={styles.cardSection}>Выдать покупку</p>
            <p className={styles.hint}>Оплата — обычным переводом на телефон администрации. Получив перевод, выдайте купленное здесь: пользователю придёт уведомление в чат.</p>
            <p className={styles.grantStatus}>
              <span>Shalter Premium</span>
              <span className={styles.grantState}>{untilLabel(state.isPremium, state.premiumForever, state.premiumUntil)}</span>
            </p>
            {durationRow(GRANT_DURATIONS, (d) =>
              run(async () => ({ patch: premiumPatch((await grantPremium(state.id, true, d.term)).user) }), `Premium выдан (${d.label}) — пользователь уведомлён в чате.`)
            )}
            {state.isPremium ? (
              <button type="button" className={styles.dangerLink} disabled={busy} onClick={() => run(async () => ({ patch: premiumPatch((await grantPremium(state.id, false)).user) }), "Premium отключён — пользователь уведомлён в чате.")}>
                Забрать Premium
              </button>
            ) : null}
            <p className={styles.grantStatus}>
              <span>Shalter для бизнеса</span>
              <span className={styles.grantState}>{untilLabel(state.isBusiness, state.businessForever, state.businessUntil)}</span>
            </p>
            {durationRow(GRANT_DURATIONS, (d) =>
              run(async () => ({ patch: businessPatch((await grantBusiness(state.id, true, d.term)).user) }), `Shalter для бизнеса выдан (${d.label}) — пользователь уведомлён в чате.`)
            )}
            {state.isBusiness ? (
              <button type="button" className={styles.dangerLink} disabled={busy} onClick={() => run(async () => ({ patch: businessPatch((await grantBusiness(state.id, false)).user) }), "Shalter для бизнеса отключён — пользователь уведомлён в чате.")}>
                Забрать Shalter для бизнеса
              </button>
            ) : null}
            <p className={styles.grantStatus}>
              <span>Кабинет рекламы</span>
              <span className={styles.grantState}>{untilLabel(state.isAdsActive, state.adsForever, state.adsUntil)}</span>
            </p>
            {durationRow(ADS_DURATIONS, (d) =>
              run(async () => ({ patch: adsPatch((await grantAds(state.id, true, d.term)).user) }), `Кабинет рекламы выдан (${d.label}) — пользователь уведомлён в чате.`)
            )}
            {state.isAdsActive ? (
              <button type="button" className={styles.dangerLink} disabled={busy} onClick={() => run(async () => ({ patch: adsPatch((await grantAds(state.id, false)).user) }), "Кабинет рекламы отключён — пользователь уведомлён в чате.")}>
                Забрать кабинет рекламы
              </button>
            ) : null}
            {gifts.length ? (
              <button type="button" className={styles.outline} disabled={busy} onClick={() => setPicking(true)}>
                🎁 Отправить подарок
              </button>
            ) : null}

            <p className={styles.cardSection}>Звёзды</p>
            <p className={styles.hint}>Начислить после перевода — или списать, указав отрицательное число.</p>
            <div className={styles.inline}>
              <TextField className={styles.mono} type="number" step="1" placeholder="например 130" value={starsInput} onChange={(e) => setStarsInput(e.target.value)} />
              <button
                type="button"
                className={styles.pill}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const amount = Number(starsInput);
                    if (!amount) throw new Error("Укажите количество звёзд");
                    const { balance } = await grantStars(state.id, amount);
                    return { notice: `Баланс: ${balance} ⭐` };
                  }, "Звёзды начислены")
                }
              >
                Начислить
              </button>
            </div>
          </>
        ) : null}

        <p className={styles.cardSection}>Верификация</p>
        <p className={styles.hint}>Галочка рядом с именем — «мы проверили, кто за этим аккаунтом». Это не отметка о безопасности: для предупреждений есть метка ниже.</p>
        <button
          type="button"
          className={state.isVerified ? `${styles.accent} ${styles.dangerFill}` : styles.accent}
          disabled={busy}
          onClick={() =>
            run(
              async () => ({ patch: { isVerified: !!(await setVerified(state.id, !state.isVerified)).user.isVerified } }),
              state.isVerified ? "Галочка снята." : "Аккаунт верифицирован — пользователь уведомлён."
            )
          }
        >
          {state.isVerified ? "Снять галочку" : "Верифицировать"}
        </button>

        {canGrantSections ? (
          <>
            <p className={styles.cardSection}>Доступ к разделам администрирования</p>
            {state.isDeveloper ? (
              <p className={styles.hint}>Этот аккаунт уже полный администратор — доступен весь раздел «Админ».</p>
            ) : (
              <>
                <p className={styles.hint}>Откроет этому аккаунту выбранные вкладки в «Настройки → Админ» — без доступа ко всем остальным.</p>
                <div className={styles.chips}>
                  {ADMIN_SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={pending.has(s.id)}
                      className={pending.has(s.id) ? `${styles.chip} ${styles.active}` : styles.chip}
                      disabled={busy}
                      onClick={() =>
                        setPending((p) => {
                          const next = new Set(p);
                          if (!next.delete(s.id)) next.add(s.id);
                          return next;
                        })
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.accent}
                  disabled={busy}
                  onClick={() => run(async () => ({ patch: { adminSections: (await setAdminSections(state.id, [...pending])).user.adminSections } }), "Доступ обновлён.")}
                >
                  Сохранить доступ
                </button>
              </>
            )}
          </>
        ) : null}

        <p className={styles.cardSection}>Метка безопасности</p>
        <p className={styles.hint}>Видна всем, кто откроет профиль или увидит чат с этим аккаунтом — предупреждение до того, как человек переведёт деньги.</p>
        <div className={styles.chips}>
          <button type="button" aria-pressed={!state.safetyLabel} className={!state.safetyLabel ? `${styles.chip} ${styles.active}` : styles.chip} disabled={busy} onClick={() => void setLabel("")}>
            Без метки
          </button>
          {labelOptions.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={state.safetyLabel === l.id}
              className={state.safetyLabel === l.id ? `${styles.chip} ${styles.active}` : styles.chip}
              disabled={busy}
              title={l.hint}
              onClick={() => void setLabel(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>

        <p className={styles.cardSection}>Блокировка</p>
        <p className={styles.hint}>
          {state.isBanned
            ? `Заблокирован ${state.bannedAt ? dateTime(state.bannedAt) : ""}${state.bannedUntil ? ` до ${dateTime(state.bannedUntil)}` : " навсегда"}. Причина: ${state.banReason || "не указана"}`
            : "Заблокированный сможет войти, но вместо чатов увидит экран блокировки с причиной и сроком."}
        </p>
        {state.isBanned ? (
          <button type="button" className={styles.accent} disabled={busy} onClick={() => void unban()}>
            Разблокировать
          </button>
        ) : (
          <div className={styles.chips}>
            {BAN_DURATIONS.map((d) => (
              <button key={d.label} type="button" className={styles.chip} disabled={busy} onClick={() => void ban(d)}>
                {d.label}
              </button>
            ))}
          </div>
        )}

        <p className={styles.cardSection}>Жалобы на этот аккаунт</p>
        {reportsQuery.isError ? (
          <p className={styles.error}>{errorText(reportsQuery.error, "Не удалось загрузить жалобы")}</p>
        ) : !reports ? (
          <p className={styles.hint}>Загружаем…</p>
        ) : reports.length === 0 ? (
          <p className={styles.hint}>Жалоб на этот аккаунт нет</p>
        ) : (
          reports.map((r) => (
            <div key={r.id} className={styles.box}>
              <p className={styles.reportHead}>
                <span className={styles.reportReason}>{r.reasonLabel}</span>
                <span className={styles.reportDate}>{dateTime(r.at)}</span>
              </p>
              <p className={styles.rowMeta}>{`От: ${r.reporter.name} · статус: ${STATUS_LABELS[r.status] ?? r.status}`}</p>
              {r.quoted ? <p className={styles.quote}>{`«${r.quoted}»`}</p> : null}
              {r.details ? <p className={styles.details}>{`Пояснение: ${r.details}`}</p> : null}
            </div>
          ))
        )}

        {canExport ? (
          <>
            <p className={styles.cardSection}>Данные аккаунта</p>
            <p className={styles.hint}>Выгрузка всех хранимых данных этого пользователя (чаты и сообщения) одним файлом. Требует основания и записывается в журнал выгрузок.</p>
            <button type="button" className={styles.outline} disabled={busy} onClick={() => void runExport()}>
              <Icon name="Download" size={14} /> Экспорт данных
            </button>
          </>
        ) : null}

        <p className={styles.cardSection}>Пароль</p>
        <p className={styles.hint}>
          Задать новый пароль вместо забытого — когда к аккаунту не привязана почта и не осталось устройства, где выполнен вход. Все сеансы завершатся, владелец получит уведомление в чат Shalter.
        </p>
        <button type="button" className={styles.outline} disabled={busy} onClick={() => void runResetPassword()}>
          <Icon name="Lock" size={14} /> Сбросить пароль
        </button>

        <p className={styles.cardSection}>Удаление аккаунта</p>
        <p className={styles.hint}>
          Необратимо: профиль, сообщения и личные чаты стираются, из групп аккаунт исчезает. Для блокировки есть кнопка выше — удаление нужно для ботоферм, дублей и просьб самого владельца.
        </p>
        <button type="button" className={`${styles.accent} ${styles.dangerFill}`} disabled={busy} onClick={() => void runDelete()}>
          Удалить аккаунт навсегда
        </button>

        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? <p className={styles.notice}>{`✅ ${notice}`}</p> : null}
      </div>
      <button type="button" className={styles.close} onClick={onClose}>
        Закрыть
      </button>
      {picking ? (
        <GiftPickDialog
          title={`Подарить: ${state.name}`}
          gifts={gifts}
          onClose={() => setPicking(false)}
          onPick={(g) => run(async () => void (await deliverGift(g.id, state.id)), `Подарок ${g.emoji} «${g.name}» отправлен.`)}
        />
      ) : null}
    </Dialog>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useSession } from "@/entities/session";
import { useSettings, useUpdateSettings } from "@/entities/settings";
import { bestPlan, handlePurchaseResponse, PlanOption, planRows } from "@/entities/stars";

import { uploadFile, type UploadKind } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { isRecordingSupported, type Recording, startRecording } from "@/shared/lib/media/recorder";
import { plural } from "@/shared/lib/presence";
import { Button, EmojiText, Icon, type IconName, SettingsPage, SettingsRow, SettingsSection, toast, Toggle } from "@/shared/ui";

import { type BusinessInfo, businessQueries, type BusinessSettings, requestBusiness, saveBusinessAddress } from "../api/business";
import { browserTimeZone, businessStatus, DAY_KEYS, DAY_LABELS, type DayHours, type DayKey, formatDayHours, formatStatus, isAllDay, timeZoneList } from "../lib/business-hours";

import styles from "./business.module.css";

const BUSINESS_PERKS: { icon: IconName; color: "orange" | "blue" | "purple" | "red"; title: string; desc: string }[] = [
  { icon: "Clock", color: "orange", title: "Часы работы", desc: "Покажите, когда вы на связи — и автоответ сам знает, когда включаться" },
  { icon: "MessageSquare", color: "blue", title: "Приветствие и автоответ", desc: "Новому клиенту — приветствие, вне часов работы — автоответ. От вашего имени, автоматически" },
  { icon: "Zap", color: "purple", title: "Быстрые ответы", desc: "Заготовленные шаблоны — не печатать одно и то же каждый раз" },
  { icon: "MapPin", color: "red", title: "Адрес на профиле", desc: "Покажите, где вас найти" },
];

const WEEKDAYS: readonly DayKey[] = ["mon", "tue", "wed", "thu", "fri"];

type AutoKey = "greeting" | "away";
type AutoAttachment = { kind: string; url: string; name?: string; durationSec?: number };

/** «Настройки → Shalter для бизнеса» (renderBusiness): подписка, часы работы, приветствие, автоответ, быстрые ответы, адрес. */
export function BusinessSection() {
  const info = useQuery(businessQueries.me());
  if (!info.data) {
    return (
      <SettingsPage>
        <p className={info.error ? styles.error : styles.hint}>{info.error ? errorText(info.error, "Не удалось загрузить") : "Загружаем…"}</p>
      </SettingsPage>
    );
  }
  return <Business info={info.data} />;
}

function Business({ info }: { info: BusinessInfo }) {
  const navigate = useNavigate();
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const business = settings?.business ?? (info.business as BusinessSettings);
  const plans = planRows(info.plans);
  const [selected, setSelected] = useState(() => bestPlan(plans));
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  // Сервер сливает настройки по верхнему уровню — бизнес шлётся целиком.
  const save = (patch: Partial<BusinessSettings>) => update.mutate({ business: { ...business, ...patch } });

  // Часовой пояс не задан — берём браузерный, как старый клиент.
  const zoneMissing = info.isBusiness && !business.timeZone && !!browserTimeZone();
  useEffect(() => {
    if (zoneMissing) update.mutate({ business: { ...business, timeZone: browserTimeZone() } });
    // Один раз при открытии.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneMissing]);

  const buy = async () => {
    if (!selected) return;
    setBuying(true);
    setBuyError(null);
    try {
      handlePurchaseResponse(await requestBusiness(selected), (chatId) => void navigate(`/chat/${chatId}`));
    } catch (err) {
      setBuyError(errorText(err, "Не удалось оформить покупку"));
    }
    setBuying(false);
  };

  const current = plans.find((p) => p.id === selected);
  const plansBlock = (
    <>
      <SettingsSection
        title={info.isBusiness ? "Продлить подписку" : "Тарифы"}
        caption={
          info.isBusiness
            ? "Новый срок прибавится к текущей дате окончания. Автопродления нет — списаний без вашего ведома не будет."
            : "Оплата переводом администрации Shalter. Автопродления нет — срок просто закончится сам."
        }
      >
        <div role="radiogroup">
          {plans.map((p) => (
            <PlanOption key={p.id} plan={p} selected={p.id === selected} disabled={buying} onSelect={() => setSelected(p.id)} />
          ))}
        </div>
      </SettingsSection>
      {buyError ? <p className={styles.error}>{buyError}</p> : null}
      <div className={styles.footer}>
        <button type="button" className={styles.confirm} disabled={buying || !current} onClick={() => void buy()}>
          {buying ? "Открываем оплату…" : `${info.isBusiness ? "Продлить" : "Подключить"} за ${current?.priceRub ?? 0} ₽`}
        </button>
      </div>
    </>
  );

  return (
    <SettingsPage>
      <Hero info={info} maxDays={Math.max(365, ...plans.map((p) => p.days))} />
      {!info.isBusiness && plans.length ? plansBlock : null}
      {!info.isBusiness ? (
        <SettingsSection title="Что входит">
          {BUSINESS_PERKS.map((p) => (
            <SettingsRow key={p.title} icon={p.icon} color={p.color} title={p.title} subtitle={p.desc} />
          ))}
        </SettingsSection>
      ) : (
        <>
          <SettingsSection>
            <SettingsRow
              title="Включено"
              subtitle="Приветствие, автоответ и часы работы применяются только пока это включено"
              toggle={{ checked: business.enabled, onChange: (v) => save({ enabled: v }) }}
            />
          </SettingsSection>
          <HoursSection business={business} save={save} />
          <AutoReplySection
            title="Приветствие"
            toggleLabel="Отправлять новому собеседнику"
            placeholder="Здравствуйте! Мы вам скоро ответим."
            autoKey="greeting"
            business={business}
            save={save}
          />
          <AutoReplySection
            title="Автоответ вне часов работы"
            toggleLabel="Отправлять вне часов работы"
            placeholder="Сейчас мы не работаем — ответим, как только начнём."
            autoKey="away"
            business={business}
            save={save}
          />
          <QuickReplies business={business} save={save} />
          <AddressSection initial={info.businessAddress ?? ""} />
        </>
      )}
      {info.isBusiness && !info.businessForever && plans.length ? plansBlock : null}
      <SettingsSection>
        <SettingsRow icon="Link" color="blue" title="Публичная страница" subtitle="Ссылка о Premium и бизнес-подписке — откроется даже без аккаунта" href="/premium#pm-business" external />
      </SettingsSection>
    </SettingsPage>
  );
}

function Hero({ info, maxDays }: { info: BusinessInfo; maxDays: number }) {
  const active = info.isBusiness;
  // «Сейчас» — на момент открытия раздела, как в старом клиенте.
  const [now] = useState(Date.now);
  const left = info.businessUntil ? Math.max(0, Math.ceil((new Date(info.businessUntil).getTime() - now) / 86400000)) : 0;
  const soon = active && !info.businessForever && left <= 7;
  return (
    <div className={styles.hero}>
      <span className={styles.heroIcon}>
        <Icon name="Bag" size={52} />
      </span>
      <h2 className={styles.heroTitle}>{active ? "У вас Shalter для бизнеса" : "Shalter для бизнеса"}</h2>
      <p className={styles.heroSubtitle}>
        {active
          ? info.businessForever
            ? "Подписка активна навсегда."
            : `Активна до ${new Date(info.businessUntil!).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}.`
          : "Превратите аккаунт в витрину: часы работы, автоответы и адрес прямо в профиле."}
      </p>
      {active && !info.businessForever ? (
        <div className={styles.meter}>
          <div className={styles.meterRow}>
            <span>{soon ? "Скоро закончится" : "Осталось"}</span>
            <span>
              {left} {plural(left, "день", "дня", "дней")}
            </span>
          </div>
          <div className={soon ? `${styles.bar} ${styles.barWarn}` : styles.bar}>
            <span style={{ width: `${Math.min(100, Math.max(3, (left / maxDays) * 100))}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Save = (patch: Partial<BusinessSettings>) => void;

function HoursSection({ business, save }: { business: BusinessSettings; save: Save }) {
  const hours = business.hours;
  const setDay = (day: DayKey, patch: Partial<DayHours>) => save({ hours: { ...hours, [day]: { ...hours[day], ...patch } } });
  const applyHours = (fn: (day: DayKey, d: DayHours) => Partial<DayHours>) =>
    save({ hours: Object.fromEntries(DAY_KEYS.map((day) => [day, { ...hours[day], ...fn(day, hours[day]) }])) as BusinessSettings["hours"] });
  const presets: { label: string; fn: (day: DayKey, d: DayHours) => Partial<DayHours> }[] = [
    { label: "Будни 9–18", fn: (day) => (WEEKDAYS.includes(day) ? { closed: false, open: "09:00", close: "18:00" } : { closed: true }) },
    { label: "Каждый день 10–22", fn: () => ({ closed: false, open: "10:00", close: "22:00" }) },
    { label: "Круглосуточно", fn: () => ({ closed: false, open: "00:00", close: "24:00" }) },
    { label: "Как в понедельник — на все будни", fn: (day, d) => (WEEKDAYS.includes(day) ? { ...hours.mon } : d) },
  ];
  const status = businessStatus(hours, business.timeZone);
  const zones = timeZoneList();
  const currentZone = business.timeZone ?? browserTimeZone() ?? "UTC";
  if (!zones.includes(currentZone)) zones.unshift(currentZone);
  const overnight = DAY_KEYS.filter((k) => !hours[k].closed && !isAllDay(hours[k]) && hours[k].close <= hours[k].open);

  return (
    <SettingsSection title="Часы работы">
      <div className={styles.pad}>
        <p className={status.open ? `${styles.status} ${styles.statusOpen}` : styles.status}>Сейчас: {formatStatus(status, hours)}</p>
        {DAY_KEYS.map((day) => {
          const d = hours[day];
          return (
            <div key={day} className={styles.dayRow}>
              <span className={styles.dayName}>{DAY_LABELS[day]}</span>
              {d.closed ? (
                <span className={`${styles.dayHours} ${styles.hint}`}>Выходной</span>
              ) : isAllDay(d) ? (
                <span className={styles.dayHours}>
                  <span className={styles.hint}>Круглосуточно</span>
                  <button type="button" className={styles.dayLink} onClick={() => setDay(day, { open: "09:00", close: "18:00" })}>
                    задать время
                  </button>
                </span>
              ) : (
                <span className={styles.dayHours}>
                  <input type="time" className={styles.time} aria-label={`${DAY_LABELS[day]}: с`} value={d.open} onChange={(e) => e.target.value && setDay(day, { open: e.target.value })} />
                  <span className={styles.hint}>–</span>
                  <input
                    type="time"
                    className={styles.time}
                    aria-label={`${DAY_LABELS[day]}: до`}
                    value={d.close === "24:00" ? "00:00" : d.close}
                    onChange={(e) => e.target.value && setDay(day, { close: e.target.value })}
                  />
                  <button type="button" className={styles.dayLink} title="Круглосуточно" onClick={() => setDay(day, { open: "00:00", close: "24:00" })}>
                    24 ч
                  </button>
                </span>
              )}
              <button type="button" className={styles.toggleButton} aria-pressed={!d.closed} aria-label={`${DAY_LABELS[day]}: рабочий день`} onClick={() => setDay(day, { closed: !d.closed })}>
                <Toggle checked={!d.closed} />
              </button>
            </div>
          );
        })}
        {overnight.length ? <p className={styles.hint}>Через полночь: {overnight.map((k) => `${DAY_LABELS[k].toLowerCase()} ${formatDayHours(hours[k])}`).join(", ")}.</p> : null}
        <div className={styles.presets}>
          {presets.map((p) => (
            <button key={p.label} type="button" className={styles.chip} onClick={() => applyHours(p.fn)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className={styles.optionRow}>
          <span>
            <span className={styles.optionTitle}>Часовой пояс</span>
            <span className={styles.hint}>По нему считаются часы работы и автоответ</span>
          </span>
          <select className={styles.select} value={currentZone} onChange={(e) => save({ timeZone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SettingsRow
        title="Показывать в профиле"
        subtitle="«Открыто · до 18:00» и расписание на неделю — видно всем, кто откроет ваш профиль"
        toggle={{ checked: business.showHours !== false, onChange: (v) => save({ showHours: v }) }}
      />
    </SettingsSection>
  );
}

type AutoProps = { title: string; toggleLabel: string; placeholder: string; autoKey: AutoKey; business: BusinessSettings; save: Save };

function AutoReplySection({ title, toggleLabel, placeholder, autoKey, business, save }: AutoProps) {
  const auto = business[autoKey];
  const [text, setText] = useState(auto.text);
  return (
    <SettingsSection title={title}>
      <SettingsRow title={toggleLabel} toggle={{ checked: auto.enabled, onChange: (v) => save({ [autoKey]: { ...auto, enabled: v } }) }} />
      <div className={styles.pad}>
        <textarea
          className={styles.textarea}
          rows={2}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== auto.text && save({ [autoKey]: { ...auto, text } })}
        />
        <AutoMedia attachments={auto.attachments as AutoAttachment[]} onChange={(attachments) => save({ [autoKey]: { ...auto, attachments } })} />
      </div>
    </SettingsSection>
  );
}

/** Вложение к приветствию или автоответу: фото, видео, файл, голосовое или кружок. */
function AutoMedia({ attachments, onChange }: { attachments: AutoAttachment[]; onChange: (attachments: AutoAttachment[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<{ mode: "voice" | "video-note"; handle: Recording; paused: boolean } | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File, kind: UploadKind, extra: { durationSec?: number } = {}) => {
    setBusy(true);
    try {
      const a = await uploadFile(file, kind);
      onChange([{ ...a, kind, ...extra }]);
    } catch (err) {
      toast(errorText(err, "Не удалось загрузить вложение"), { error: true });
    }
    setBusy(false);
  };

  const record = async (mode: "voice" | "video-note") => {
    if (recording) return;
    let handle: Recording;
    try {
      handle = await startRecording(mode);
    } catch {
      toast("Нет доступа к микрофону или камере", { error: true });
      return;
    }
    setRecording({ mode, handle, paused: false });
    void handle.result.then((rec) => {
      setRecording(null);
      if (!rec) return;
      const ext = rec.mimeType.includes("mp4") ? "mp4" : "webm";
      void upload(new File([rec.blob], `${mode}-${Date.now()}.${ext}`, { type: rec.mimeType }), mode, { durationSec: rec.durationSec });
    });
  };

  if (recording) {
    return (
      <div className={styles.recordBar}>
        {recording.mode === "video-note" ? <RoundPreview stream={recording.handle.previewStream ?? recording.handle.stream} /> : null}
        <span className={styles.recordDot} />
        <span className={styles.optionTitle}>{recording.mode === "voice" ? "Идёт запись голосового…" : "Идёт запись кружка…"}</span>
        <button
          type="button"
          className={styles.chip}
          title={recording.paused ? "Продолжить" : "Пауза"}
          aria-label={recording.paused ? "Продолжить" : "Пауза"}
          onClick={() => {
            if (recording.paused) recording.handle.resume();
            else recording.handle.pause();
            setRecording({ ...recording, paused: recording.handle.isPaused() });
          }}
        >
          <Icon name={recording.paused ? "Play" : "Pause"} size={16} />
        </button>
        <Button onClick={() => recording.handle.stop()}>Готово</Button>
        <Button variant="link" className={styles.danger} onClick={() => recording.handle.cancel()}>
          Отмена
        </Button>
      </div>
    );
  }
  if (busy) return <p className={styles.hint}>Загрузка вложения…</p>;
  const att = attachments[0];
  if (att) {
    return (
      <div className={styles.mediaCurrent}>
        <AutoPreview a={att} />
        <Button variant="link" className={styles.danger} onClick={() => onChange([])}>
          Убрать вложение
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.presets}>
      <button type="button" className={styles.chip} onClick={() => mediaInput.current?.click()}>
        Фото или видео
      </button>
      <input
        ref={mediaInput}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f, f.type.startsWith("video/") ? "video" : "image");
        }}
      />
      <button type="button" className={styles.chip} onClick={() => fileInput.current?.click()}>
        Аудио или файл
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f, "file");
        }}
      />
      {isRecordingSupported() ? (
        <>
          <button type="button" className={styles.chip} onClick={() => void record("voice")}>
            <EmojiText text="🎤 Голосовое" />
          </button>
          <button type="button" className={styles.chip} onClick={() => void record("video-note")}>
            <EmojiText text="⭕ Кружок" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function RoundPreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      void ref.current.play?.().catch(() => {});
    }
  }, [stream]);
  return <video ref={ref} className={styles.round} autoPlay muted playsInline />;
}

function AutoPreview({ a }: { a: AutoAttachment }) {
  const sec = a.durationSec ? ` · ${Math.round(a.durationSec)} с` : "";
  if (a.kind === "image") return <img className={styles.preview} src={a.url} alt={a.name ?? ""} />;
  if (a.kind === "video") return <video className={styles.preview} src={a.url} controls />;
  if (a.kind === "voice") return <EmojiText text={`🎤 Голосовое${sec}`} />;
  if (a.kind === "video-note") return <EmojiText text={`⭕ Кружок${sec}`} />;
  return (
    <a href={a.url} target="_blank" rel="noreferrer">
      {a.name ?? "Файл"}
    </a>
  );
}

function QuickReplies({ business, save }: { business: BusinessSettings; save: Save }) {
  const replies = business.quickReplies;
  const [shortcut, setShortcut] = useState("");
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim();
    if (!value) return;
    // id и вложения быстрому ответу назначит сервер.
    save({ quickReplies: [...replies, { shortcut: shortcut.trim(), text: value } as BusinessSettings["quickReplies"][number]] });
    setShortcut("");
    setText("");
  };
  return (
    <SettingsSection title="Быстрые ответы">
      <div className={styles.pad}>
        {replies.map((q, i) => (
          <div key={q.id || i} className={styles.reply}>
            <div className={styles.replyBody}>
              {q.shortcut ? <p className={`${styles.optionTitle} ${styles.mono}`}>/{q.shortcut}</p> : null}
              <p className={styles.hint}>{q.text}</p>
            </div>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.danger}`}
              title="Удалить"
              aria-label="Удалить"
              onClick={() => save({ quickReplies: replies.filter((_, j) => j !== i) })}
            >
              <Icon name="Trash" size={16} />
            </button>
          </div>
        ))}
        <div className={styles.replyInputs}>
          <input className={`${styles.input} ${styles.mono} ${styles.shortcut}`} placeholder="ярлык" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
          <input className={styles.input} placeholder="Текст быстрого ответа" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button onClick={add}>Добавить</Button>
      </div>
    </SettingsSection>
  );
}

function AddressSection({ initial }: { initial: string }) {
  const client = useQueryClient();
  const me = useSession().data?.user;
  const [address, setAddress] = useState(initial);
  const [saving, setSaving] = useState(false);
  const saveAddress = async () => {
    if (!me) return;
    setSaving(true);
    try {
      const { user } = await saveBusinessAddress(me.id, address.trim() || null);
      client.setQueryData(businessQueries.me().queryKey, (d) => (d ? { ...d, businessAddress: user?.businessAddress ?? null } : d));
    } catch (err) {
      toast(errorText(err, "Не удалось сохранить адрес"), { error: true });
    }
    setSaving(false);
  };
  return (
    <SettingsSection title="Адрес на профиле">
      <div className={styles.pad}>
        <input className={styles.input} placeholder="Город, улица, дом" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Button disabled={saving} onClick={() => void saveAddress()}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </SettingsSection>
  );
}

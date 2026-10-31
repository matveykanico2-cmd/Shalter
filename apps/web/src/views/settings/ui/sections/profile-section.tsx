import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { AvatarViewer } from "@/widgets/user-profile";

import { type SelfUser, useSession, useUpdateSelf } from "@/entities/session";
import { bannerBackground, PROFILE_BANNERS, ProfileStatusBadge, ProfileTrackCard } from "@/entities/user";

import { ApiError, uploadFile } from "@/shared/api";
import { errorText } from "@/shared/lib/error-text";
import { fileToImageUpload, mediaDuration } from "@/shared/lib/image";
import { Avatar, Button, DateField, Icon, PhoneField, SettingsPage, SettingsSection, TextField, toast } from "@/shared/ui";

import { addProfileTrack, clearProfileTracks, removeProfileTrack, setMainProfileTrack } from "../../api/profile-api";
import { updateProfile } from "../../api/settings-api";
import { AVATAR_COLORS, NAME_COLORS } from "../../lib/profile-colors";
import { PhonePasswordDialog } from "../phone-password-dialog";
import { StatusDialog } from "../status-dialog";

import profileStyles from "./profile-section.module.css";
import styles from "./sections.module.css";

const PHONE_NEEDS_PASSWORD = "Чтобы сменить номер, введите пароль от аккаунта";
const MAX_TRACKS = 20;

/** «Изменить профиль» — renderProfile. */
export function ProfileSection() {
  const me = useSession().data?.user;
  return me ? <Profile me={me} /> : null;
}

type Fields = { name: string; lastName: string; username: string; phone: string; bio: string; birthday: string };

function Profile({ me }: { me: SelfUser }) {
  const navigate = useNavigate();
  const updateSelf = useUpdateSelf();
  const lastName0 = me.lastName ?? "";
  const [firstName, setFirstName] = useState(() => (lastName0 && me.name.endsWith(` ${lastName0}`) ? me.name.slice(0, -(lastName0.length + 1)) : me.name));
  const [lastName, setLastName] = useState(lastName0);
  const [username, setUsername] = useState(me.username ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [birthday, setBirthday] = useState<{ iso: string | null; error: string | null }>({ iso: me.birthday ?? "", error: null });
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [phoneAsk, setPhoneAsk] = useState<Fields | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [saved]);

  // Поле профиля сразу на сервер (цвет, баннер): не сохранилось — прежнее значение и тост.
  const saveField = async (patch: Partial<SelfUser>, fallback: string) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, me[k as keyof SelfUser]])) as Partial<SelfUser>;
    updateSelf(patch);
    try {
      await updateProfile(me.id, patch);
    } catch (err) {
      updateSelf(before);
      toast(errorText(err, fallback), { error: true });
    }
  };

  const applySaved = (user: SelfUser) => {
    updateSelf({ name: user.name, lastName: user.lastName ?? "", username: user.username, phone: user.phone, bio: user.bio ?? "", birthday: user.birthday ?? "" });
    setUsername(user.username ?? "");
    setBio(user.bio ?? "");
    setSaved(true);
  };

  const save = async () => {
    setProfileError(null);
    if (birthday.error || birthday.iso === null) {
      setProfileError(`Дата рождения: ${(birthday.error ?? "неверная дата").toLowerCase()}`);
      return;
    }
    const fields: Fields = { name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "), lastName: lastName.trim(), username, phone, bio, birthday: birthday.iso };
    try {
      applySaved(await updateProfile(me.id, fields));
    } catch (err) {
      // Номер изменился — сервер просит пароль от аккаунта.
      if (err instanceof ApiError && err.status === 400 && err.message === PHONE_NEEDS_PASSWORD) setPhoneAsk(fields);
      else setProfileError(errorText(err, "Не удалось сохранить"));
    }
  };

  const nameColorValue = me.nameColor ? NAME_COLORS[me.nameColor] : undefined;
  const pickNameColor = (key: string | null) => {
    if (!me.isPremium) {
      toast("Цвет имени — возможность Shalter Premium");
      void navigate("/settings/premium");
      return;
    }
    void saveField({ nameColor: key ?? undefined }, "Не удалось сохранить цвет");
  };

  return (
    <SettingsPage>
      <div className={profileStyles.header}>
        <button type="button" className={profileStyles.avatarButton} aria-label="Фото профиля" onClick={() => setAvatarOpen(true)}>
          <Avatar name={[firstName, lastName].filter(Boolean).join(" ") || "?"} color={me.avatarColor} image={(me as any).avatarImage} emoji={(me as any).avatarEmoji} size={120} />
          <span className={profileStyles.avatarEdit}>
            <Icon name="Edit" size={12} />
          </span>
          {me.avatarImages.length > 1 ? <span className={profileStyles.avatarCount}>{me.avatarImages.length}</span> : null}
        </button>
        <p className={profileStyles.name}>
          <span>{me.name || "Без имени"}</span>
          {me.isDeveloper ? (
            <span className={profileStyles.developer} title="Разработчик Shalter">
              <Icon name="Code" size={16} />
            </span>
          ) : null}
          {me.isPremium ? (
            <span className={profileStyles.premium} title="Shalter Premium">
              <Icon name="Star" size={18} />
            </span>
          ) : null}
          <ProfileStatusBadge user={me} size={18} />
        </p>
        <p className={`${profileStyles.sub} ${styles.mono}`}>{me.phone || me.email}</p>
      </div>

      {!me.avatarImage ? (
        <SettingsSection title="Цвет аватара">
          <p className={`${styles.hint} ${profileStyles.pad}`}>Фон кружка с инициалами, пока не задано фото профиля</p>
          <div className={profileStyles.colorGrid}>
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={me.avatarColor === c ? `${profileStyles.colorSwatch} ${profileStyles.colorActive}` : profileStyles.colorSwatch}
                style={{ background: c }}
                title="Выбрать цвет"
                aria-label={`Цвет ${c}`}
                aria-pressed={me.avatarColor === c}
                onClick={() => void saveField({ avatarColor: c }, "Не удалось сохранить цвет")}
              />
            ))}
          </div>
        </SettingsSection>
      ) : null}

      <BannerPicker me={me} onSave={(banner) => void saveField({ profileBanner: banner ?? undefined }, "Не удалось сохранить баннер")} />

      <SettingsSection title="Цвет имени" caption={me.isPremium ? "Цвет имени видят все участники групп." : "Выбирать цвет имени можно с Shalter Premium."}>
        <div className={profileStyles.namePreview}>
          <div className={profileStyles.nameBubble}>
            <span className={profileStyles.nameColor} style={nameColorValue ? ({ "--name-light": nameColorValue.light, "--name-dark": nameColorValue.dark } as CSSProperties) : undefined}>
              {me.name || "Вы"}
            </span>
            <span>Так ваше имя увидят в группах</span>
          </div>
        </div>
        <div className={profileStyles.nameGrid}>
          <button type="button" className={`${profileStyles.nameSwatch} ${profileStyles.nameNone}${me.nameColor ? "" : ` ${profileStyles.colorActive}`}`} title="Без цвета" aria-label="Без цвета" onClick={() => pickNameColor(null)}>
            <Icon name="X" size={16} />
          </button>
          {Object.entries(NAME_COLORS).map(([key, c]) => (
            <button
              key={key}
              type="button"
              className={[profileStyles.nameSwatch, me.nameColor === key && profileStyles.nameActive, !me.isPremium && profileStyles.locked].filter(Boolean).join(" ")}
              style={{ "--name-light": c.light, "--name-dark": c.dark } as CSSProperties}
              title={me.isPremium ? c.label : `${c.label} — с Premium`}
              aria-label={me.isPremium ? c.label : `${c.label} — с Premium`}
              onClick={() => pickNameColor(key)}
            >
              {me.isPremium ? null : <Icon name="Lock" size={12} />}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Имя</span>
          <TextField value={firstName} maxLength={64} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Фамилия</span>
          <TextField value={lastName} placeholder="необязательно" maxLength={60} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Юзернейм</span>
          <TextField value={username} maxLength={32} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Телефон</span>
          <PhoneField initial={me.phone ?? ""} onChange={setPhone} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>О себе</span>
          <textarea className={styles.textarea} rows={3} value={bio} maxLength={300} onChange={(e) => setBio(e.target.value)} />
          <span className={`${styles.hint} ${profileStyles.counter}`}>{300 - bio.length}</span>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Дата рождения</span>
          <DateField value={me.birthday ?? ""} onChange={(iso, error) => setBirthday({ iso, error })} />
          {birthday.error ? <span className={styles.error}>{birthday.error}</span> : <span className={styles.hint}>Например: 25.12.1990</span>}
        </label>
      </SettingsSection>

      <SettingsSection title="Статус">
        <div className={styles.inline}>
          <div className={styles.grow}>
            <p className={profileStyles.rowTitle}>Значок рядом с именем</p>
            <p className={styles.hint}>{me.isPremium ? "До 5 своих статусов — свой или из готовых." : "1 слот — с Premium будет 5."}</p>
          </div>
          <Button variant="secondary" className={profileStyles.actionButton} onClick={() => setStatusOpen(true)}>
            {me.statusIcon ? "Изменить" : "Выбрать"}
          </Button>
        </div>
      </SettingsSection>

      <ProfileTracks me={me} />

      {profileError ? <p className={styles.error}>{profileError}</p> : null}
      <Button className={profileStyles.save} onClick={() => void save()}>
        {saved ? "Сохранено ✓" : "Сохранить"}
      </Button>

      {statusOpen ? <StatusDialog onClose={() => setStatusOpen(false)} /> : null}
      {avatarOpen ? <AvatarViewer user={me} canEdit onChange={(u) => updateSelf(u as Partial<SelfUser>)} onClose={() => setAvatarOpen(false)} /> : null}
      {phoneAsk ? (
        <PhonePasswordDialog
          onClose={() => setPhoneAsk(null)}
          onSubmit={async (currentPassword) => {
            applySaved(await updateProfile(me.id, { ...phoneAsk, currentPassword }));
            setPhoneAsk(null);
          }}
        />
      ) : null}
    </SettingsPage>
  );
}

/** Баннер профиля: встроенный фон или своё фото. */
function BannerPicker({ me, onSave }: { me: SelfUser; onSave: (banner: { id: string; url?: string } | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Локальное состояние выбранного баннера — применяется сразу при клике, не ждём ответа сервера.
  const [selected, setSelected] = useState<{ id?: string; url?: string } | null>(me.profileBanner ?? null);
  const current = bannerBackground(selected);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadFile(await fileToImageUpload(file, 1600), "image");
      const next = { id: "custom", url };
      setSelected(next);
      onSave(next);
    } catch (err) {
      toast(errorText(err, "Не удалось загрузить фото"), { error: true });
    } finally {
      setUploading(false);
    }
  };

  return (
    <SettingsSection title="Баннер профиля" caption="Фон в шапке вашего профиля — его видят все, кто открывает профиль.">
      <div className={current ? profileStyles.bannerPreview : `${profileStyles.bannerPreview} ${profileStyles.bannerEmpty}`} style={current ? ({ "--tile-bg": current } as CSSProperties) : undefined}>
        {current ? null : "Выберите фон или загрузите своё фото"}
      </div>
      <div className={profileStyles.bannerGrid}>
        <button type="button" className={`${profileStyles.bannerTile} ${profileStyles.bannerAdd}`} disabled={uploading} onClick={() => fileInput.current?.click()}>
          <Icon name="Image" size={16} />
          {uploading ? "Загрузка…" : "Своё фото"}
        </button>
        <button type="button" className={`${profileStyles.bannerTile} ${profileStyles.bannerAdd}${selected?.id ? "" : ` ${profileStyles.bannerSelected}`}`} onClick={() => {
          setSelected(null);
          void onSave(null);
        }}>
          <Icon name="X" size={14} />
          Без баннера
        </button>
        {PROFILE_BANNERS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={selected?.id === b.id ? `${profileStyles.bannerTile} ${profileStyles.bannerSelected}` : profileStyles.bannerTile}
            title={b.label}
            aria-pressed={selected?.id === b.id}
            style={{ "--tile-bg": b.css } as CSSProperties}
            onClick={() => {
              setSelected({ id: b.id });
              void onSave({ id: b.id });
            }}
          >
            <span className={profileStyles.bannerLabel}>{b.label}</span>
          </button>
        ))}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
    </SettingsSection>
  );
}

type Track = { url: string; name?: string };

/** Музыка в профиле: несколько треков, первый — основной (карточкой), остальные — списком. */
function ProfileTracks({ me }: { me: SelfUser }) {
  const updateSelf = useUpdateSelf();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const tracks = (me.profileTracks.length ? me.profileTracks : me.profileTrack ? [me.profileTrack] : []) as Track[];

  const apply = (user: { profileTrack: unknown; profileTracks: unknown[] }) => {
    updateSelf({ profileTrack: user.profileTrack ?? null, profileTracks: user.profileTracks ?? [] });
  };
  const run = async (fn: () => Promise<void>, failText: string) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err, failText));
    } finally {
      setBusy(false);
    }
  };
  // Можно выбрать сразу несколько: добавляем по очереди, последний выбранный — основной.
  const addFiles = (files: File[]) =>
    run(async () => {
      for (const file of files) {
        const duration = await mediaDuration(file);
        const uploaded = await uploadFile(file, "profile-track");
        apply((await addProfileTrack({ url: uploaded.url, name: uploaded.name, size: uploaded.size, mimeType: uploaded.mimeType, duration })).user);
      }
    }, "Не удалось загрузить трек");

  return (
    <SettingsSection title="Музыка в профиле">
      <p className={`${styles.hint} ${profileStyles.pad}`}>Треки видны всем, кто открывает ваш профиль: основной — карточкой, остальные — списком по нажатию на неё. До 20 треков.</p>
      <div className={profileStyles.pad}>
        <ProfileTrackCard tracks={tracks} />
      </div>
      <div className={profileStyles.trackList}>
        {tracks.map((t, i) => (
          <div key={`${t.url}-${i}`} className={profileStyles.trackRow}>
            <span className={profileStyles.trackName}>{t.name || "Трек"}</span>
            {i === 0 ? (
              <span className={profileStyles.badge}>основной</span>
            ) : (
              <button
                type="button"
                className={styles.iconButton}
                title="Сделать основным"
                aria-label="Сделать основным"
                disabled={busy}
                onClick={() => void run(async () => apply((await setMainProfileTrack(i)).user), "Не удалось сделать основным")}
              >
                <Icon name="Star" size={16} />
              </button>
            )}
            <button
              type="button"
              className={styles.iconButton}
              title="Убрать"
              aria-label="Убрать"
              disabled={busy}
              onClick={() => void run(async () => apply((await removeProfileTrack(i)).user), "Не удалось убрать трек")}
            >
              <Icon name="Trash" size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" className={profileStyles.actionButton} disabled={busy || tracks.length >= MAX_TRACKS} onClick={() => fileInput.current?.click()}>
          {busy ? "Загружаем…" : tracks.length ? "Добавить треки" : "Загрузить треки"}
        </Button>
        {tracks.length > 1 ? (
          <Button variant="danger" className={profileStyles.actionButton} disabled={busy} onClick={() => void run(async () => apply((await clearProfileTracks()).user), "Не удалось убрать трек")}>
            Убрать все
          </Button>
        ) : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void addFiles(files);
        }}
      />
    </SettingsSection>
  );
}

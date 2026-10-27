import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import { useSession } from "@/entities/session";
import { patchSettings, useSettings, useUpdateSettings } from "@/entities/settings";

import { APP_ICONS, type AppIcon, appIconScope, appIconSvg, canUseAppIcon, getAppIconId, setAppIcon } from "@/shared/lib/app-icons";
import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { Icon, SettingsPage, SettingsRow, SettingsSection, toast, WALLPAPER_GROUPS, wallpaperProps } from "@/shared/ui";

import { ACCENTS, effectiveFontSize, FONT_MAX, FONT_MIN, isThemeAccent, LANGUAGES, THEMES, UNSUPPORTED_LANGUAGE_NOTE } from "../config/appearance";

import styles from "./appearance.module.css";

/** Размер применяется сразу (как use-appearance), сохраняется по отпусканию ползунка. */
function FontSizeControl({ saved, onSave }: { saved: number | undefined; onSave: (size: number) => void }) {
  const [size, setSize] = useState(() => effectiveFontSize(saved));
  const apply = (n: number) => {
    const root = document.documentElement;
    if (n === effectiveFontSize(undefined)) root.style.removeProperty("--messages-text");
    else root.style.setProperty("--messages-text", `${n}px`);
  };
  return (
    <div className={styles.block}>
      <div className={styles.rangeHead}>
        <span>Размер текста сообщений</span>
        <span className={styles.rangeValue}>{size}</span>
      </div>
      <input
        className={styles.range}
        type="range"
        min={FONT_MIN}
        max={FONT_MAX}
        step={1}
        value={size}
        aria-label="Размер текста сообщений"
        onChange={(e) => {
          const n = Number(e.target.value);
          setSize(n);
          apply(n);
        }}
        onPointerUp={() => size !== effectiveFontSize(saved) && onSave(size)}
        onKeyUp={() => size !== effectiveFontSize(saved) && onSave(size)}
      />
    </div>
  );
}

/** «Внешний вид» — renderAppearance в public/js/views/settings/index.js. */
export function AppearanceSection() {
  const navigate = useNavigate();
  const me = useSession().data?.user;
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [wallpaperError, setWallpaperError] = useState<string | null>(null);
  const [appIconId, setAppIconId] = useState(getAppIconId);
  const [appIconBusy, setAppIconBusy] = useState(false);

  if (!settings) return null;

  const pickCustomWallpaper = async (file: File | undefined) => {
    if (!file) return;
    setWallpaperError(null);
    try {
      update.mutate({ chatWallpaper: "custom", chatWallpaperImage: await fileToImageDataUrl(file, 1280) });
    } catch (err) {
      setWallpaperError(errorText(err, "Не удалось загрузить фото"));
    }
  };

  // Иконка приложения — как в Telegram: часть вариантов только с Premium.
  const pickAppIcon = async (icon: AppIcon) => {
    if (appIconBusy || icon.id === appIconId) return;
    if (!canUseAppIcon(icon.id, me)) {
      toast("Эта иконка — с Shalter Premium");
      void navigate("/settings/premium");
      return;
    }
    setAppIconBusy(true);
    setAppIconId(icon.id);
    try {
      // Выбор уходит и в аккаунт (remember): после переустановки приложения память устройства пуста.
      await setAppIcon(icon.id);
    } catch (err) {
      // Нативная часть не смогла (старая версия приложения без плагина и т. п.) —
      // значок вкладки и заставка всё равно сменились, говорим честно.
      toast(err instanceof Error && err.message ? `Не удалось сменить иконку: ${err.message}` : "Не удалось сменить иконку на рабочем столе");
      setAppIconId(getAppIconId());
    } finally {
      setAppIconBusy(false);
    }
  };

  const custom = settings.chatWallpaper === "custom" && settings.chatWallpaperImage ? settings.chatWallpaperImage : null;

  return (
    <SettingsPage>
      <SettingsSection title="Размер текста">
        <FontSizeControl saved={settings.fontSize} onSave={(fontSize) => update.mutate({ fontSize })} />
      </SettingsSection>
      <SettingsSection title="Тема">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={styles.radioRow} aria-pressed={settings.theme === t.id} onClick={() => update.mutate({ theme: t.id })}>
            <span className={styles.radio} />
            <span>{t.label}</span>
          </button>
        ))}
      </SettingsSection>
      <SettingsSection
        title="Иконка приложения"
        caption={
          appIconScope() === "native"
            ? "Меняет значок на рабочем столе и заставку при запуске."
            : "В браузере меняются значок вкладки и заставка. Значок на рабочем столе меняется в приложении Shalter для Android, iOS и компьютера."
        }
      >
        <div className={styles.iconGrid}>
          {APP_ICONS.map((icon) => {
            const locked = !canUseAppIcon(icon.id, me);
            return (
              <button
                key={icon.id}
                type="button"
                className={locked ? `${styles.iconTile} ${styles.locked}` : styles.iconTile}
                disabled={appIconBusy}
                aria-pressed={icon.id === appIconId}
                title={locked ? `${icon.label} — с Premium` : icon.label}
                onClick={() => void pickAppIcon(icon)}
              >
                <span className={styles.iconImg} dangerouslySetInnerHTML={{ __html: appIconSvg(icon, "square") }} />
                {icon.premium ? (
                  <span className={styles.iconBadge}>
                    <Icon name={locked ? "Lock" : "Star"} size={11} />
                  </span>
                ) : null}
                <span className={styles.iconLabel}>{icon.label}</span>
              </button>
            );
          })}
        </div>
      </SettingsSection>
      <SettingsSection title="Акцентный цвет">
        <div className={`${styles.block} ${styles.swatches}`}>
          {ACCENTS.map((hex) => (
            <button
              key={hex || "theme"}
              type="button"
              className={styles.swatch}
              title={hex || "Как в теме"}
              aria-label={hex || "Как в теме"}
              aria-pressed={hex ? settings.accent === hex : isThemeAccent(settings.accent)}
              style={{ background: hex || "linear-gradient(135deg, #3390ec 50%, #8774e1 50%)" }}
              onClick={() => update.mutate({ accent: hex })}
            />
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="Фон чата">
        <div className={styles.block}>
          <p className={styles.hint}>Общий фон по умолчанию — отдельный фон для конкретного чата задаётся в самом чате через меню «⋯» → «Фон чата».</p>
          {WALLPAPER_GROUPS.map((group) => (
            <section key={group.label}>
              <p className={styles.groupLabel}>{group.label}</p>
              <div className={styles.grid}>
                {group.items.map((w) => {
                  const isCustom = w.id === "custom";
                  const fill = wallpaperProps(isCustom && custom ? { id: "custom", image: custom } : { id: w.id });
                  return (
                    <button
                      key={w.id}
                      type="button"
                      title={w.label}
                      aria-label={w.label}
                      aria-pressed={settings.chatWallpaper === w.id}
                      className={styles.wallSwatch}
                      onClick={() => (isCustom ? fileInput.current?.click() : update.mutate({ chatWallpaper: w.id }))}
                    >
                      <span className={`${styles.fill} ${fill.className}`} style={fill.style}>
                        {isCustom && !custom ? <Icon name="Plus" size={18} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {wallpaperError ? <p className={styles.error}>{wallpaperError}</p> : null}
        </div>
        <SettingsRow
          title="Обои на главном экране"
          subtitle="Этот фон будет и под списком чатов"
          toggle={{ checked: !!settings.homeWallpaper, onChange: (v) => update.mutate({ homeWallpaper: v }) }}
        />
        <input ref={fileInput} type="file" accept="image/*" hidden aria-label="Своё фото" onChange={(e) => void pickCustomWallpaper(e.target.files?.[0])} />
      </SettingsSection>
      <SettingsSection title="Язык">
        <div className={styles.block}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Перевод сообщений</span>
            <select className={styles.select} value={settings.translateLanguage} onChange={(e) => update.mutate({ translateLanguage: e.target.value })}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className={styles.note}>Кнопка «Перевести» в меню сообщения переводит его на этот язык</span>
            <span className={styles.note}>{UNSUPPORTED_LANGUAGE_NOTE}</span>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Язык интерфейса</span>
            <select
              className={styles.select}
              value={settings.uiLanguage}
              onChange={async (e) => {
                try {
                  await patchSettings({ uiLanguage: e.target.value });
                  window.location.reload();
                } catch (err) {
                  toast(errorText(err, "Не удалось сохранить настройки"), { error: true });
                }
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className={styles.note}>
              Переводит саму программу — кнопки, меню, надписи (не сообщения) — через Google Translate. Применяется после перезагрузки страницы.
            </span>
            <span className={styles.note}>{UNSUPPORTED_LANGUAGE_NOTE}</span>
          </label>
        </div>
      </SettingsSection>
      <SettingsSection title="Формат времени">
        <div className={styles.block}>
          <select
            className={styles.select}
            aria-label="Формат времени"
            value={String(settings.timeFormat ?? 24)}
            onChange={(e) => update.mutate({ timeFormat: e.target.value === "12" ? 12 : 24 })}
          >
            <option value="24">24 часа</option>
            <option value="12">12 часов (AM/PM)</option>
          </select>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

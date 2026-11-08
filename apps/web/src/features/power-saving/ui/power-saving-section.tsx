import { type PowerSavingMode, updatePowerSaving, usePowerSavingState } from "@/shared/lib/power-saving";
import { SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

import styles from "./power-saving.module.css";

const MODE_LABELS: Record<PowerSavingMode, string> = { off: "Выключен", auto: "Автоматически", always: "Всегда" };

export function PowerSavingSection() {
  const { settings, batteryLevel, charging } = usePowerSavingState();
  const mode = settings.mode;
  return (
    <SettingsPage subtitle="Меньше анимаций и фоновой нагрузки — приложение работает плавнее и дольше сохраняет заряд.">
      <SettingsSection title="Режим">
        <SettingsRow
          icon="Zap"
          color="green"
          title="Энергосбережение"
          subtitle={batteryLevel == null ? "Заряд батареи недоступен этому устройству" : `Заряд: ${batteryLevel}%${charging ? " · идёт зарядка" : ""}`}
          right={(
            <select className={styles.select} aria-label="Режим энергосбережения" value={mode} onChange={(e) => updatePowerSaving({ mode: e.target.value as PowerSavingMode })}>
              {Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          )}
        />
        {mode === "auto" ? (
          <label className={styles.rangeRow}>
            <span>Включать при заряде {settings.threshold}%</span>
            <input type="range" min="5" max="100" step="5" value={settings.threshold} onChange={(e) => updatePowerSaving({ threshold: Number(e.target.value) })} />
          </label>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Что ограничивать" caption="Звонки, запись видео и открытое вручную медиа продолжают работать.">
        <SettingsRow title="Анимации интерфейса" subtitle="Переходы, стикеры и декоративное движение" disabled={mode === "off"} toggle={{ checked: settings.animations, onChange: (animations) => updatePowerSaving({ animations }), disabled: mode === "off" }} />
        <SettingsRow title="Автовоспроизведение" subtitle="Зацикленные видео и анимированные аватары" disabled={mode === "off"} toggle={{ checked: settings.autoplay, onChange: (autoplay) => updatePowerSaving({ autoplay }), disabled: mode === "off" }} />
        <SettingsRow title="Эффекты сообщений" subtitle="Разлетающиеся эмодзи и праздничные эффекты" disabled={mode === "off"} toggle={{ checked: settings.effects, onChange: (effects) => updatePowerSaving({ effects }), disabled: mode === "off" }} />
      </SettingsSection>
    </SettingsPage>
  );
}

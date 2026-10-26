import { useQuery } from "@tanstack/react-query";

import { useSettings, useUpdateSettings } from "@/entities/settings";

import { errorText } from "@/shared/lib/error-text";
import { isSpeechSupported } from "@/shared/lib/media/speech";
import { type IconName, SettingsPage, SettingsRow, type SettingsRowColor, SettingsSection } from "@/shared/ui";

import { settingsViewQueries } from "../../api/settings-api";
import { formatBytes } from "../../lib/sessions";

const BUCKETS: { key: "photos" | "videos" | "files" | "voice"; label: string; icon: IconName; color: SettingsRowColor }[] = [
  { key: "photos", label: "Фото", icon: "Image", color: "orange" },
  { key: "videos", label: "Видео", icon: "Video", color: "blue" },
  { key: "files", label: "Файлы", icon: "File", color: "green" },
  { key: "voice", label: "Голосовые", icon: "Mic", color: "purple" },
];

/** «Данные и память» — renderData: объём вложений, автозагрузка, расшифровка голосовых. */
export function DataSection() {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const usage = useQuery(settingsViewQueries.storage());
  if (!settings) return null;

  const usageError = usage.isError ? errorText(usage.error, "Не удалось посчитать") : null;
  const buckets = usage.data?.bytesByBucket;
  const size = (v: number | undefined) => (usageError ? "—" : buckets ? formatBytes(v ?? 0) : "Считаем…");
  const total = buckets ? Object.values(buckets).reduce((a, b) => a + b, 0) : 0;

  return (
    <SettingsPage>
      <SettingsSection title="Использование памяти" caption="Реальный объём фото, видео, файлов и голосовых, которые вы отправили в чаты.">
        <SettingsRow title="Вложения в переписке" subtitle={usageError || size(total)} />
        {BUCKETS.map((b) => (
          <SettingsRow key={b.key} icon={b.icon} color={b.color} title={b.label} subtitle={size(buckets?.[b.key])} />
        ))}
      </SettingsSection>
      <SettingsSection title="Автозагрузка медиа" caption="Если выключено, фото и видео загружаются только по нажатию.">
        <SettingsRow title="Автозагрузка медиа" toggle={{ checked: settings.autoDownload, onChange: (v) => update.mutate({ autoDownload: v }) }} />
      </SettingsSection>
      <SettingsSection
        title="Голосовые сообщения"
        caption={
          isSpeechSupported()
            ? "Во время записи браузер распознаёт речь, и текст уходит вместе с голосовым — собеседник откроет его кнопкой «→A». В Chrome распознавание идёт через серверы Google."
            : "Этот браузер не умеет распознавать речь — включите в Chrome, Edge или Safari."
        }
      >
        <SettingsRow
          icon="Mic"
          color="red"
          title="Расшифровка голосовых"
          toggle={{ checked: !!settings.voiceTranscription, onChange: (v) => update.mutate({ voiceTranscription: v }) }}
        />
      </SettingsSection>
    </SettingsPage>
  );
}

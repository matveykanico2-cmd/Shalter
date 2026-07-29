"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Settings } from "@/lib/types";

const OPTIONS: { value: Settings["privacy"]["lastSeen"]; label: string }[] = [
  { value: "everyone", label: "Все" },
  { value: "contacts", label: "Мои контакты" },
  { value: "nobody", label: "Никто" },
];

function Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Settings["privacy"]["lastSeen"];
  onChange: (v: Settings["privacy"]["lastSeen"]) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3">
      <span className="text-sm">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Settings["privacy"]["lastSeen"])}
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function PrivacySettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings));
  }, []);

  async function patch(privacy: Partial<Settings["privacy"]>) {
    if (!settings) return;
    const next = { ...settings, privacy: { ...settings.privacy, ...privacy } };
    setSettings(next);
    await api.patchSettings({ privacy: next.privacy });
  }

  if (!settings) return null;

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <p className="mb-1 font-serif text-xl font-semibold">Конфиденциальность</p>
      <p className="mb-4 text-sm text-muted">Кто видит вашу информацию</p>
      <Row label="Последний визит" value={settings.privacy.lastSeen} onChange={(v) => patch({ lastSeen: v })} />
      <Row label="Номер телефона" value={settings.privacy.phone} onChange={(v) => patch({ phone: v })} />
      <Row label="Фото профиля" value={settings.privacy.photo} onChange={(v) => patch({ photo: v })} />
    </div>
  );
}

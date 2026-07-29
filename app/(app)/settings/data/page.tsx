"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Settings } from "@/lib/types";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span
        className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const CACHE = [
  { label: "Фото", mb: 128 },
  { label: "Видео", mb: 640 },
  { label: "Файлы", mb: 42 },
  { label: "Голосовые", mb: 9 },
];

export default function DataSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings));
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!settings) return;
    setSettings({ ...settings, ...p });
    await api.patchSettings(p);
  }

  if (!settings) return null;
  const total = CACHE.reduce((a, c) => a + (cleared.has(c.label) ? 0 : c.mb), 0);

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <p className="mb-1 font-serif text-xl font-semibold">Данные и память</p>
      <p className="mb-4 text-sm text-muted">Автозагрузка медиа и локальный кэш</p>

      <div className="mb-6 flex items-center justify-between border-b border-border py-3">
        <div>
          <p className="text-sm">Автозагрузка медиа</p>
          <p className="text-xs text-muted">Загружать фото и файлы автоматически</p>
        </div>
        <Toggle checked={settings.autoDownload} onChange={(v) => patch({ autoDownload: v })} />
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        Использовано места — {(total / 1024).toFixed(2)} ГБ
      </p>
      <div className="flex flex-col gap-1.5">
        {CACHE.map((c) => (
          <div key={c.label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-sm">{c.label}</span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs tabular-nums text-muted">
                {cleared.has(c.label) ? "0 МБ" : `${c.mb} МБ`}
              </span>
              <button
                disabled={cleared.has(c.label)}
                onClick={() => setCleared((s) => new Set(s).add(c.label))}
                className="text-xs font-medium text-accent disabled:text-muted"
              >
                Очистить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

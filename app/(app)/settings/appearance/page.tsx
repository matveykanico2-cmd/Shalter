"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { Settings } from "@/lib/types";

const ACCENTS = ["#2E56D9", "#C6403B", "#1F9D63", "#B9791C", "#6E56C6", "#1C9BD9", "#D9822E"];
const WALLPAPERS = [
  { id: "default", label: "По умолчанию" },
  { id: "dots", label: "Точки" },
  { id: "gradient", label: "Градиент" },
];

function applyTheme(theme: Settings["theme"]) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }
}

function applyAccent(hex: string) {
  document.documentElement.style.setProperty("--color-accent", hex);
  localStorage.setItem("accent", hex);
}

export default function AppearanceSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then((r) => {
      setSettings(r.settings);
      applyAccent(r.settings.accent);
    });
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...p };
    setSettings(next);
    if (p.theme) applyTheme(p.theme);
    if (p.accent) applyAccent(p.accent);
    await api.patchSettings(p);
  }

  if (!settings) return null;

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <p className="mb-1 font-serif text-xl font-semibold">Внешний вид</p>
      <p className="mb-4 text-sm text-muted">Тема, акцентный цвет и фон переписки</p>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Тема</p>
      <div className="mb-6 flex gap-2">
        {([
          { id: "light", label: "Светлая" },
          { id: "dark", label: "Тёмная" },
          { id: "system", label: "Системная" },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => patch({ theme: t.id })}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              settings.theme === t.id ? "border-accent bg-accent-soft text-accent" : "border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Акцентный цвет</p>
      <div className="mb-6 flex gap-2">
        {ACCENTS.map((hex) => (
          <button
            key={hex}
            onClick={() => patch({ accent: hex })}
            style={{ background: hex }}
            className={`h-9 w-9 rounded-full ${settings.accent === hex ? "ring-2 ring-offset-2 ring-offset-bg ring-text" : ""}`}
          />
        ))}
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        Размер шрифта сообщений — {settings.fontSize}px
      </p>
      <input
        type="range"
        min={13}
        max={19}
        value={settings.fontSize}
        onChange={(e) => patch({ fontSize: Number(e.target.value) })}
        className="mb-6 w-full accent-accent"
      />

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Фон чата</p>
      <div className="flex gap-2">
        {WALLPAPERS.map((w) => (
          <button
            key={w.id}
            onClick={() => patch({ chatWallpaper: w.id })}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              settings.chatWallpaper === w.id ? "border-accent bg-accent-soft text-accent" : "border-border"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}

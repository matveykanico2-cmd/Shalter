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

export default function NotificationsSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings));
  }, []);

  async function patch(notifications: Partial<Settings["notifications"]>) {
    if (!settings) return;
    const next = { ...settings, notifications: { ...settings.notifications, ...notifications } };
    setSettings(next);
    await api.patchSettings({ notifications: next.notifications });
  }

  if (!settings) return null;

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <p className="mb-1 font-serif text-xl font-semibold">Уведомления</p>
      <p className="mb-4 text-sm text-muted">Как мессенджер сообщает о новых событиях</p>

      <div className="flex items-center justify-between border-b border-border py-3">
        <div>
          <p className="text-sm">Показывать текст в превью</p>
          <p className="text-xs text-muted">Иначе — «Новое сообщение» без содержимого</p>
        </div>
        <Toggle checked={settings.notifications.previewText} onChange={(v) => patch({ previewText: v })} />
      </div>
      <div className="flex items-center justify-between border-b border-border py-3">
        <span className="text-sm">Звук</span>
        <Toggle checked={settings.notifications.sound} onChange={(v) => patch({ sound: v })} />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-alt p-4">
        <p className="mb-2 text-sm font-medium">Уведомления браузера</p>
        <p className="mb-3 text-xs text-muted">
          Статус: {browserPerm === "granted" ? "разрешены" : browserPerm === "denied" ? "запрещены" : browserPerm === "unsupported" ? "не поддерживаются" : "не запрошены"}
        </p>
        {browserPerm === "default" && (
          <button
            onClick={async () => {
              const res = await Notification.requestPermission();
              setBrowserPerm(res);
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-contrast"
          >
            Разрешить уведомления
          </button>
        )}
      </div>
    </div>
  );
}

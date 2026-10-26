import { useEffect, useState } from "react";

import { isPushSupported, pushDiagnostics, requestPushPermission } from "@/shared/lib/push";
import { Button, Dialog } from "@/shared/ui";

import { markPermissionsAsked } from "../lib/asked";

import styles from "./permissions-dialog.module.css";

type Key = "notifications" | "mic" | "camera" | "location" | "contacts";
type Item = { key: Key; title: string; hint: string; available: boolean; run: () => Promise<unknown> };

async function askMedia(kind: "mic" | "camera") {
  const stream = await navigator.mediaDevices.getUserMedia(kind === "camera" ? { video: true } : { audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

async function permissionGranted(name: string) {
  try {
    return (await navigator.permissions.query({ name: name as PermissionName })).state === "granted";
  } catch {
    return false;
  }
}

// Уже выданное разрешение — сразу галочкой, а не «Разрешить» заново.
async function alreadyGranted(key: Key) {
  if (key === "notifications") return (await pushDiagnostics().catch(() => null))?.разрешение === "granted";
  if (key === "mic") return permissionGranted("microphone");
  if (key === "camera") return permissionGranted("camera");
  if (key === "location") return permissionGranted("geolocation");
  return false;
}

const contactPicker = () => "contacts" in navigator && "ContactsManager" in window;

function items(): Item[] {
  const media = !!navigator.mediaDevices?.getUserMedia;
  return [
    {
      key: "notifications",
      title: "Уведомления",
      hint: "Сообщения и звонки, когда приложение закрыто",
      // В приложениях (Android, десктоп) браузерного Notification нет — уведомления там свои.
      available: isPushSupported(),
      run: async () => {
        if (!(await requestPushPermission())) throw new Error("Отказано в браузере");
      },
    },
    { key: "mic", title: "Микрофон", hint: "Звонки и голосовые сообщения", available: media, run: () => askMedia("mic") },
    { key: "camera", title: "Камера", hint: "Видеозвонки, кружки и съёмка фото", available: media, run: () => askMedia("camera") },
    {
      key: "location",
      title: "Геолокация",
      hint: "Отправка своего местоположения и живой геолокации",
      available: !!navigator.geolocation,
      run: () =>
        new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 })),
    },
    {
      key: "contacts",
      title: "Контакты",
      hint: contactPicker()
        ? "Найти знакомых, которые уже в Shalter"
        : "Этот браузер не умеет отдавать контакты — импорт доступен в мобильном приложении",
      available: contactPicker(),
      run: async () => {},
    },
  ];
}

/**
 * «Разрешения» (public/js/components/permissionsDialog.js): уведомления, микрофон, камера,
 * геолокация и контакты — чтобы не спрашивали в самый неподходящий момент.
 */
export function PermissionsDialog({ onClose }: { onClose: () => void }) {
  const [list] = useState(items);
  const [state, setState] = useState<Partial<Record<Key, string>>>({});

  useEffect(() => {
    let alive = true;
    for (const item of list) {
      if (item.available) void alreadyGranted(item.key).then((ok) => alive && ok && setState((s) => (s[item.key] ? s : { ...s, [item.key]: "ok" })));
    }
    return () => {
      alive = false;
    };
  }, [list]);

  const close = () => {
    markPermissionsAsked();
    onClose();
  };

  const run = async (item: Item) => {
    try {
      await item.run();
      setState((s) => ({ ...s, [item.key]: "ok" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
      setState((s) => ({ ...s, [item.key]: message === "Permission denied" ? "Отказано — можно включить в настройках браузера" : message || "Не получилось" }));
    }
  };

  return (
    <Dialog title="Разрешения" onClose={close}>
      <p className={styles.hint}>Чтобы звонки, уведомления и фотографии работали сразу, а не спрашивали в самый неподходящий момент.</p>
      <div className={styles.body}>
        {list.map((item) => {
          const status = state[item.key];
          return (
            <div key={item.key} className={styles.row}>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>{item.title}</p>
                <p className={styles.hint}>{status && status !== "ok" ? status : item.hint}</p>
              </div>
              {status === "ok" ? (
                <span className={styles.ok} aria-label="Разрешено">
                  ✓
                </span>
              ) : (
                <Button className={styles.pill} disabled={!item.available} onClick={() => void run(item)}>
                  {item.available ? "Разрешить" : "Недоступно"}
                </Button>
              )}
            </div>
          );
        })}
        <p className={styles.hint}>Показ поверх других приложений включается в настройках Android — в браузере такого разрешения нет.</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={close}>
            Готово
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

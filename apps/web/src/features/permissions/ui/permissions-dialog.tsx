import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { http } from "@/shared/api";
import { isInstalledApp } from "@/shared/lib/platform";
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
  if (key === "contacts") {
    const native = plugins()?.isNativePlatform?.() ? plugins()?.Plugins?.Contacts : undefined;
    if (!native) return false;
    const permission = (await native.checkPermissions()).contacts;
    return permission === "granted" || permission === "limited";
  }
  return false;
}

type PhoneEntry = { name: string; phone: string };
type ContactMatch = { user: { id: string }; localName?: string | null; alreadyContact?: boolean };
type ContactsPlugin = {
  checkPermissions: () => Promise<{ contacts: string }>;
  requestPermissions: () => Promise<{ contacts: string }>;
  getContacts: (options: { projection: { name: boolean; phones: boolean } }) => Promise<{ contacts?: { name?: { display?: string; given?: string; family?: string }; phones?: { number?: string }[] }[] }>;
};
type NativePlugins = { Contacts?: ContactsPlugin };

const plugins = () => (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: NativePlugins } }).Capacitor;
const contactPicker = () => ("contacts" in navigator && "ContactsManager" in window) || !!(plugins()?.isNativePlatform?.() && plugins()?.Plugins?.Contacts);

async function selectedContacts(): Promise<PhoneEntry[]> {
  const native = plugins()?.isNativePlatform?.() ? plugins()?.Plugins?.Contacts : undefined;
  if (native) {
    let permission = (await native.checkPermissions()).contacts;
    if (permission !== "granted" && permission !== "limited") permission = (await native.requestPermissions()).contacts;
    if (permission !== "granted" && permission !== "limited") throw new DOMException("Permission denied", "NotAllowedError");
    const result = await native.getContacts({ projection: { name: true, phones: true } });
    return (result.contacts ?? []).flatMap((contact) => {
      const name = contact.name?.display ?? [contact.name?.given, contact.name?.family].filter(Boolean).join(" ");
      return (contact.phones ?? []).flatMap((phone) => (phone.number ? [{ name: name ?? "", phone: String(phone.number) }] : []));
    });
  }
  const manager = (navigator as Navigator & { contacts?: { select: (fields: string[], options: { multiple: boolean }) => Promise<unknown[]> } }).contacts;
  if (!manager) throw new Error("Контакты недоступны");
  const contacts = (await manager.select(["name", "tel"], { multiple: true })) as { name?: string[]; tel?: string[] }[];
  return contacts.flatMap((contact) => {
    const name = (contact.name ?? []).filter(Boolean).join(" ").trim();
    return (contact.tel ?? []).flatMap((phone) => (phone ? [{ name, phone: String(phone) }] : []));
  });
}

async function pickContacts() {
  const contacts = await selectedContacts();
  for (let index = 0; index < contacts.length; index += 500) {
    const result = await http.post<{ found: ContactMatch[] }>("/api/contacts/match", { contacts: contacts.slice(index, index + 500) });
    const unique = new Map(result.found.map((entry) => [entry.user.id, entry]));
    for (const entry of unique.values()) {
      if (!entry.alreadyContact) await http.post("/api/contacts", { userId: entry.user.id, localName: entry.localName || null, sharePhone: false });
    }
  }
}

async function openAppSettings() {
  if (!plugins()?.isNativePlatform?.()) throw new Error("Откройте настройки браузера и разрешите доступ вручную");
  const { AndroidSettings, IOSSettings, NativeSettings } = await import("capacitor-native-settings");
  await NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App });
}

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
      run: pickContacts,
    },
  ];
}

/**
 * «Разрешения» (public/js/components/permissionsDialog.js): уведомления, микрофон, камера,
 * геолокация и контакты — чтобы не спрашивали в самый неподходящий момент.
 */
export function PermissionsDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
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
    if (state[item.key] === "denied") {
      try {
        await openAppSettings();
      } catch (err) {
        setState((s) => ({ ...s, [item.key]: err instanceof Error ? err.message : "Откройте настройки приложения" }));
      }
      return;
    }
    // Реакция на касание видна сразу; системное окно разрешения может открываться дольше.
    setState((s) => ({ ...s, [item.key]: "asking" }));
    try {
      await item.run();
      if (item.key === "contacts") await queryClient.invalidateQueries({ queryKey: ["users", "contacts"] });
      setState((s) => ({ ...s, [item.key]: "ok" }));
    } catch (err) {
      const source = err as { name?: string; message?: string } | null;
      const message = err instanceof Error ? err.message : source?.message;
      const denied = source?.name === "NotAllowedError" || /denied|отказ/i.test(message ?? "");
      setState((s) => ({ ...s, [item.key]: denied ? "denied" : message || "Не получилось" }));
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
                <p className={styles.hint}>{status === "asking" ? "Ожидаем разрешение…" : status === "denied" ? "Доступ запрещён — откройте настройки" : status && status !== "ok" ? status : item.hint}</p>
              </div>
              {status === "ok" ? (
                <span className={styles.ok} aria-label="Разрешено">
                  ✓
                </span>
              ) : (
                <Button className={styles.pill} disabled={!item.available || status === "asking"} onClick={() => void run(item)}>
                  {!item.available ? "Недоступно" : status === "asking" ? "Проверяем…" : status === "denied" ? "Настройки" : "Разрешить"}
                </Button>
              )}
            </div>
          );
        })}
        {isInstalledApp() && /Android/i.test(navigator.userAgent) ? (
          <p className={styles.hint}>Показ поверх других приложений включается в настройках Android.</p>
        ) : null}
      </div>
      {/* Кнопка всегда видна: на телефоне список длиннее экрана, и «Готово» уезжало за прокрутку. */}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={close}>
          Готово
        </Button>
      </div>
    </Dialog>
  );
}

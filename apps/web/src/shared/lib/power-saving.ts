import { useEffect, useSyncExternalStore } from "react";

export type PowerSavingMode = "off" | "auto" | "always";
export type PowerSavingSettings = {
  mode: PowerSavingMode;
  threshold: number;
  animations: boolean;
  autoplay: boolean;
  effects: boolean;
};

type BatteryLike = EventTarget & { level: number; charging: boolean };
type Snapshot = { settings: PowerSavingSettings; batteryLevel: number | null; charging: boolean | null };
type BatteryNavigator = Navigator & { getBattery?: () => Promise<BatteryLike> };

const KEY = "shalter.powerSaving";
const DEFAULTS: PowerSavingSettings = { mode: "auto", threshold: 20, animations: true, autoplay: true, effects: true };
const listeners = new Set<() => void>();

function load(): PowerSavingSettings {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PowerSavingSettings> | null;
    const mode = value?.mode === "off" || value?.mode === "always" || value?.mode === "auto" ? value.mode : DEFAULTS.mode;
    return {
      mode,
      threshold: Math.max(5, Math.min(100, Number(value?.threshold) || DEFAULTS.threshold)),
      animations: value?.animations ?? DEFAULTS.animations,
      autoplay: value?.autoplay ?? DEFAULTS.autoplay,
      effects: value?.effects ?? DEFAULTS.effects,
    };
  } catch {
    return DEFAULTS;
  }
}

let snapshot: Snapshot = { settings: load(), batteryLevel: null, charging: null };
let batteryStarted = false;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = (next: Snapshot) => {
  snapshot = next;
  for (const listener of listeners) listener();
};
const getSnapshot = () => snapshot;

export function updatePowerSaving(patch: Partial<PowerSavingSettings>) {
  const settings = { ...snapshot.settings, ...patch };
  settings.threshold = Math.max(5, Math.min(100, settings.threshold));
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // В приватном режиме настройка действует до закрытия приложения.
  }
  emit({ ...snapshot, settings });
}

export function usePowerSavingState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function powerSavingActive(value = snapshot): boolean {
  if (value.settings.mode === "always") return true;
  return value.settings.mode === "auto" && value.batteryLevel != null && value.charging === false && value.batteryLevel <= value.settings.threshold;
}

export function powerSavingBlocks(kind: "animations" | "autoplay" | "effects") {
  return powerSavingActive() && snapshot.settings[kind];
}

function startBattery() {
  if (batteryStarted) return;
  batteryStarted = true;
  void (navigator as BatteryNavigator).getBattery?.().then((battery) => {
    const sync = () => emit({ ...snapshot, batteryLevel: Math.round(battery.level * 100), charging: battery.charging });
    battery.addEventListener("levelchange", sync);
    battery.addEventListener("chargingchange", sync);
    sync();
  }).catch(() => {});
}

/** Применяет локальный режим ко всем оболочкам: браузеру, Android/iOS и Tauri. */
export function usePowerSavingRuntime() {
  const state = usePowerSavingState();
  useEffect(startBattery, []);
  useEffect(() => {
    const root = document.documentElement;
    const active = powerSavingActive(state);
    root.toggleAttribute("data-power-saving", active);
    root.toggleAttribute("data-power-saving-motion", active && state.settings.animations);
    root.toggleAttribute("data-power-saving-autoplay", active && state.settings.autoplay);
    root.toggleAttribute("data-power-saving-effects", active && state.settings.effects);
  }, [state]);
  useEffect(() => {
    const stopDecorativeVideo = (event: Event) => {
      const video = event.target;
      if (!(video instanceof HTMLVideoElement) || !document.documentElement.hasAttribute("data-power-saving-autoplay")) return;
      if (video.autoplay && video.muted && video.loop) video.pause();
    };
    document.addEventListener("play", stopDecorativeVideo, true);
    return () => document.removeEventListener("play", stopDecorativeVideo, true);
  }, []);
}


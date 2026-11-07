import { type FormEvent, useEffect, useState } from "react";

import { Button, SettingsSection, TextField, toast } from "@/shared/ui";

import { type NativeProxy, nativeProxyBridge, type NativeProxyType, nativeProxyUrl, parseNativeProxyUrl, validateNativeProxy } from "../lib/native-proxy";

import styles from "./proxy.module.css";

const EMPTY: NativeProxy = { type: "socks5", host: "", port: 1080, username: "", password: "" };

/** Свой HTTP/SOCKS5-прокси для всего трафика приложения — только в нативной оболочке. */
export function NativeProxySection() {
  const [bridge] = useState(nativeProxyBridge);
  const [form, setForm] = useState<NativeProxy>(EMPTY);
  const [port, setPort] = useState(String(EMPTY.port));
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [ping, setPing] = useState<number | "checking" | null>(null);

  useEffect(() => {
    if (!bridge) return;
    bridge
      .getProxy()
      .then((url) => {
        const p = parseNativeProxyUrl(url);
        if (!p) return;
        setForm(p);
        setPort(String(p.port));
        setActive(true);
      })
      .catch(() => {});
  }, [bridge]);

  if (!bridge) return null;

  const set = (patch: Partial<NativeProxy>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(null);
  };

  const apply = async (url: string | null) => {
    try {
      await bridge.setProxy(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err || "Не удалось сохранить прокси"));
      return;
    }
    setActive(!!url);
    setPing(null);
    setNeedsRestart(true);
    toast(url ? "Прокси сохранён — перезапустите приложение" : "Прокси выключен — перезапустите приложение");
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const proxy = { ...form, port: Number(port) };
    const problem = validateNativeProxy(proxy);
    if (problem) return setError(problem);
    void apply(nativeProxyUrl(proxy));
  };

  const toggle = () => {
    if (active) return void apply(null);
    const proxy = { ...form, port: Number(port) };
    const problem = validateNativeProxy(proxy);
    if (problem) return setError(problem);
    void apply(nativeProxyUrl(proxy));
  };

  const checkPing = async () => {
    setPing("checking");
    const started = performance.now();
    try {
      const response = await fetch(`/api/proxy-info?ping=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error();
      setPing(Math.max(1, Math.round(performance.now() - started)));
    } catch {
      setPing(null);
      setError("Прокси не отвечает. Проверьте адрес, порт и перезапустите приложение.");
    }
  };

  return (
    <SettingsSection
      title="Прокси приложения"
      caption="Свой HTTP- или SOCKS5-прокси: через него пойдёт весь трафик приложения — страницы, сообщения, файлы и звонки через сервер. Действует после перезапуска."
    >
      <form className={styles.nativeForm} onSubmit={save}>
        <label className={styles.proxyToggle}>
          <span>
            <strong>Использовать прокси</strong>
            <small>{active ? "Включён для приложения" : "Выключен"}</small>
          </span>
          <input type="checkbox" role="switch" checked={active} onChange={toggle} />
        </label>
        <label className={styles.field}>
          <span>Тип</span>
          <select aria-label="Тип прокси" value={form.type} onChange={(e) => set({ type: e.target.value as NativeProxyType })}>
            <option value="socks5">SOCKS5</option>
            <option value="http">HTTP</option>
          </select>
        </label>
        <TextField aria-label="IP-адрес или сервер прокси" placeholder="IP-адрес или сервер" value={form.host} autoComplete="off" onChange={(e) => set({ host: e.target.value })} />
        <TextField
          aria-label="Порт прокси"
          placeholder="Порт"
          inputMode="numeric"
          value={port}
          onChange={(e) => {
            setPort(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
        />
        <TextField aria-label="Логин прокси" placeholder="Логин (необязательно)" value={form.username} autoComplete="off" onChange={(e) => set({ username: e.target.value })} />
        <TextField
          aria-label="Пароль прокси"
          placeholder="Пароль (необязательно)"
          type="password"
          value={form.password}
          autoComplete="new-password"
          onChange={(e) => set({ password: e.target.value })}
        />
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.nativeActions}>
          <Button type="submit" disabled={!form.host.trim() || !port}>
            Сохранить
          </Button>
          {active ? (
            <Button variant="secondary" disabled={ping === "checking"} onClick={() => void checkPing()}>
              {ping === "checking" ? "Проверяем…" : ping === null ? "Проверить пинг" : `Пинг ${ping} мс`}
            </Button>
          ) : null}
          {needsRestart && bridge.restart ? (
            <Button variant="secondary" onClick={() => void bridge.restart?.()}>
              Перезапустить
            </Button>
          ) : null}
        </div>
      </form>
    </SettingsSection>
  );
}

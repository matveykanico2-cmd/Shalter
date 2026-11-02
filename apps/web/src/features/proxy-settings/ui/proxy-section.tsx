import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useSearchParams } from "react-router";

import { isInstalledApp } from "@/shared/lib/platform";
import { Button, Icon, SettingsButton, SettingsPage, SettingsRow, SettingsSection, TextField, toast } from "@/shared/ui";

import { proxyQueries } from "../api/proxy-info";
import { parseProxyLink, type ProxyLink } from "../lib/proxy-link";
import { savedProxies, useSavedProxies } from "../model/saved-proxies";

import { NativeProxySection } from "./native-proxy-section";
import styles from "./proxy.module.css";
import { NativeProxyDialog, ProxyQr, ProxyShareDialog } from "./proxy-dialogs";

/** «Настройки → Прокси»: текущее подключение, добавить ссылку, сохранённые прокси (на этом устройстве). */
export function ProxySection() {
  const info = useQuery(proxyQueries.info()).data ?? null;
  const saved = useSavedProxies();
  const [params, setParams] = useSearchParams();
  // shalter://settings/proxy?url=… — ссылку из приложения сразу подставляем в поле.
  const [input, setInput] = useState(() => params.get("url") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ProxyLink | null>(null);
  const [nativeHelp, setNativeHelp] = useState<ProxyLink | null>(null);
  const current = info ? parseProxyLink(info.link) : null;
  const here = window.location.origin;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const proxy = parseProxyLink(input);
    if (!proxy) {
      setError("Это не похоже на ссылку прокси. Пример: https://proxy.example.net/?proxy=…");
      return;
    }
    savedProxies.add(proxy);
    setInput("");
    setError(null);
    if (params.has("url")) {
      params.delete("url");
      setParams(params, { replace: true });
    }
    toast(`Прокси ${proxy.host} сохранён`);
  };

  const connect = (proxy: ProxyLink) => {
    if (isInstalledApp()) setNativeHelp(proxy);
    else window.location.assign(proxy.link);
  };

  return (
    <SettingsPage subtitle="Если Shalter не открывается в вашей сети, подключитесь через прокси — сервер, через который идёт весь трафик приложения. Свой прокси поднимается на любом сервере одной командой Docker.">
      <SettingsSection title="Подключение">
        {current ? (
          <>
            <SettingsRow icon="Shield" color="green" title="Вы подключены через прокси" subtitle={current.host} />
            <ProxyQr link={current.link} />
            <SettingsButton icon="Share" onClick={() => setSharing(current)}>
              Поделиться прокси
            </SettingsButton>
            {saved.some((p) => p.origin === current.origin) ? null : (
              <SettingsButton icon="Plus" onClick={() => savedProxies.add(current)}>
                Сохранить в список
              </SettingsButton>
            )}
          </>
        ) : (
          <SettingsRow icon="Globe" color="blue" title="Прямое подключение" subtitle="Без прокси" />
        )}
      </SettingsSection>

      <NativeProxySection />

      <SettingsSection title="Добавить прокси" caption="Вставьте ссылку, которой с вами поделились, — вида https://адрес/?proxy=секрет.">
        <form className={styles.form} onSubmit={add}>
          <TextField
            aria-label="Ссылка на прокси"
            placeholder="https://proxy.example.net/?proxy=…"
            value={input}
            inputMode="url"
            autoComplete="off"
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
          />
          <Button type="submit" disabled={!input.trim()}>
            Добавить
          </Button>
        </form>
        {error ? <p className={styles.error}>{error}</p> : null}
      </SettingsSection>

      <SettingsSection title="Сохранённые прокси" caption="Список хранится только на этом устройстве.">
        {saved.length ? (
          saved.map((proxy) => {
            const active = proxy.origin === here;
            return (
              <SettingsRow
                key={proxy.origin}
                icon="Link"
                color="purple"
                title={proxy.host}
                subtitle={active ? "Подключено" : proxy.secret ? "Закрытый, по ссылке с секретом" : "Открытый"}
                right={
                  <span className={styles.actions}>
                    <button type="button" className={styles.connect} disabled={active} aria-label={`Подключиться к ${proxy.host}`} onClick={() => connect(proxy)}>
                      {active ? "Подключено" : "Подключиться"}
                    </button>
                    <button type="button" className={styles.iconButton} title="Поделиться" aria-label={`Поделиться ${proxy.host}`} onClick={() => setSharing(proxy)}>
                      <Icon name="Qrcode" size={20} />
                    </button>
                    <button type="button" className={styles.iconButton} title="Удалить" aria-label={`Удалить ${proxy.host}`} onClick={() => savedProxies.remove(proxy.origin)}>
                      <Icon name="Trash" size={20} />
                    </button>
                  </span>
                }
              />
            );
          })
        ) : (
          <p className={styles.empty}>Здесь появятся прокси, которые вы добавите.</p>
        )}
      </SettingsSection>

      {sharing ? <ProxyShareDialog proxy={sharing} onClose={() => setSharing(null)} /> : null}
      {nativeHelp ? <NativeProxyDialog proxy={nativeHelp} onClose={() => setNativeHelp(null)} /> : null}
    </SettingsPage>
  );
}

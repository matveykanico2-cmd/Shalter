import { useEffect, useState } from "react";

import { SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

const KEY = "shalter.proxy.url";

export function ProxySection() {
  const [value, setValue] = useState(() => (typeof localStorage !== "undefined" ? localStorage.getItem(KEY) ?? "" : ""));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 1500);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const save = () => {
    try {
      if (value.trim()) localStorage.setItem(KEY, value.trim());
      else localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    setSaved(true);
  };

  return (
    <SettingsPage>
      <SettingsSection title="Прокси">
        <div style={{ padding: "12px 16px" }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-muted)" }}>
            URL прокси-сервера (http/https/socks5) для просмотра заблокированного контента внутри Shalter.
          </p>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="http://127.0.0.1:1080"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
          />
          <button type="button" onClick={save} style={{ marginTop: 10, padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-accent)", color: "#fff", cursor: "pointer" }}>
            {saved ? "Сохранено" : "Сохранить"}
          </button>
        </div>
      </SettingsSection>
      <SettingsSection title="Подсказка">
        <SettingsRow icon="Info" color="grey" title="Прокси применяется при перезапуске приложения" />
      </SettingsSection>
    </SettingsPage>
  );
}

export default ProxySection;
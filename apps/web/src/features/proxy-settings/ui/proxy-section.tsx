import { useEffect, useState } from "react";

import { SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

const KEY = "shalter.proxy";

type ProxyConfig = {
  server: string;
  port: string;
  username: string;
  password: string;
  type: "http" | "socks5" | "vpn";
};

const DEFAULT: ProxyConfig = { server: "", port: "", username: "", password: "", type: "http" };

function load(): ProxyConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULT };
}

export function ProxySection() {
  const [cfg, setCfg] = useState<ProxyConfig>(load);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 1500);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const update = (patch: Partial<ProxyConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch {
      // ignore
    }
    setSaved(true);
  };

  const shareLink = () => {
    const payload = btoa(JSON.stringify(cfg));
    const url = `${location.origin}/proxy/${payload}`;
    try {
      navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  };

  const importVpn = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        // AmneziaVPN .vpn файл — JSON с полями
        const parsed = JSON.parse(text);
        update({
          server: parsed.host || parsed.server || parsed.address || cfg.server,
          port: String(parsed.port || cfg.port),
          username: parsed.username || cfg.username,
          password: parsed.password || cfg.password,
          type: "vpn",
        });
      } catch {
        // попробуем как socks/http URL
        const m = String(reader.result ?? "").match(/^(socks5|http|https):\/\/(?:([^:]+):([^@]+)@)?([^:/]+):?(\d+)?/);
        if (m) {
          update({ type: m[1] === "socks5" ? "socks5" : "http", username: m[2] ?? "", password: m[3] ?? "", server: m[4], port: m[5] ?? "" });
        }
      }
    };
    reader.readAsText(file);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
    marginTop: 4,
  };

  return (
    <SettingsPage>
      <SettingsSection title="Прокси / VPN">
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Тип
            <select value={cfg.type} onChange={(e) => update({ type: e.target.value as ProxyConfig["type"] })} style={inputStyle}>
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
              <option value="vpn">VPN (Amnezia)</option>
            </select>
          </label>
          <label style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Сервер (IP/хост)
            <input type="text" value={cfg.server} onChange={(e) => update({ server: e.target.value })} placeholder="127.0.0.1" style={inputStyle} />
          </label>
          <label style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Порт
            <input type="text" value={cfg.port} onChange={(e) => update({ port: e.target.value })} placeholder="1080" style={inputStyle} />
          </label>
          <label style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Логин
            <input type="text" value={cfg.username} onChange={(e) => update({ username: e.target.value })} placeholder="user" style={inputStyle} />
          </label>
          <label style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Пароль
            <input type="password" value={cfg.password} onChange={(e) => update({ password: e.target.value })} placeholder="••••" style={inputStyle} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <button type="button" onClick={save} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-accent)", color: "#fff", cursor: "pointer" }}>
              {saved ? "Сохранено" : "Сохранить"}
            </button>
            <button type="button" onClick={shareLink} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", cursor: "pointer" }}>
              Поделиться ссылкой
            </button>
            <label style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", cursor: "pointer" }}>
              Импорт .vpn
              <input type="file" accept=".vpn,.json,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importVpn(f); }} />
            </label>
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title="Подсказка">
        <SettingsRow icon="Info" color="grey" title="Прокси применяется при перезапуске приложения" />
        <SettingsRow icon="Info" color="grey" title="Ссылку можно отправить в чат — получатель импортирует настройки" />
      </SettingsSection>
    </SettingsPage>
  );
}

export default ProxySection;
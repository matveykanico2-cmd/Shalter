import "./styles/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installEmojiCopy } from "@/shared/lib/emoji-images";
import { ensurePushSubscribed } from "@/shared/lib/push";

import { App } from "./app";

const root = document.getElementById("root");
if (!root) throw new Error("Нет корневого узла #root");

installEmojiCopy();

// Фоновая доставка должна быть готова до полной загрузки оболочки. Разрешение
// здесь не запрашиваем: подписываемся только если пользователь уже разрешил
// уведомления, а обычный запрос остаётся в окне разрешений.
if ("serviceWorker" in navigator && !(window as Window & { Capacitor?: unknown }).Capacitor) {
  void navigator.serviceWorker.register("/sw.js").then(() => ensurePushSubscribed().catch(() => {})).catch(() => {});
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

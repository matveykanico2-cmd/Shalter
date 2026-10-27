// Эффект сообщения — как playMessageEffect в public/js/components/messageBubble.js:
// 14 эмодзи разлетаются из пузыря. Свежее сообщение проигрывает его один раз.
import styles from "../ui/message-bubble.module.css";

const played = new Set<string>();
const FRESH_MS = 10_000;

export function playMessageEffect(emoji: string, anchor: Element | null) {
  if (!anchor || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const r = anchor.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = styles.effectLayer!;
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 140;
    const p = document.createElement("span");
    p.className = styles.effectParticle!;
    p.textContent = emoji;
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist - 60}px`);
    p.style.animationDelay = `${Math.random() * 150}ms`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1600);
}

/** Пришло или ушло только что и ещё не играло — сыграть сейчас. */
export function shouldPlayEffect(id: string, createdAt: string, now = Date.now()) {
  if (played.has(id) || now - Date.parse(createdAt) >= FRESH_MS) return false;
  played.add(id);
  return true;
}

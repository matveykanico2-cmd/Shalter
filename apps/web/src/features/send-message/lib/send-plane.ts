// Самолётик при отправке — как playSendPlaneAnimation в main2 (public/js/components/messageBubble.js):
// бумажный самолётик цвета акцента летит от кнопки «Отправить» к середине ленты за 0,6 с.
import { motionReduced } from "@/shared/lib/motion";

import styles from "./send-plane.module.css";

const PLANE_SVG =
  '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l17-8L4 4l0 6.5L15 12 4 13.5 4 20Z"/></svg>';
const FLIGHT_MS = 600;
// Кнопка «Отправить» — справа от поля ввода (после отправки на её месте уже микрофон).
const SEND_BUTTON_OFFSET = 24;

export type PlanePath = { start: [number, number]; mid: [number, number]; end: [number, number]; midRot: number; endRot: number };

/** Путь полёта: середина — со случайным сдвигом ±50 по x и на 80±20 выше старта, поворот около −45°. */
export function planePath(from: DOMRect, to: DOMRect, rand: () => number = Math.random): PlanePath {
  const start: [number, number] = [Math.min(from.right + SEND_BUTTON_OFFSET, window.innerWidth - 16), from.top + from.height / 2];
  const end: [number, number] = [to.left + to.width / 2, to.top + to.height / 2];
  const mid: [number, number] = [start[0] + (end[0] - start[0]) * 0.5 + (rand() - 0.5) * 100, start[1] - 80 + (rand() - 0.5) * 40];
  return { start, mid, end, midRot: -45 + (rand() - 0.5) * 30, endRot: -45 + (rand() - 0.5) * 20 };
}

// Лента открытого чата; если её нет на экране — середина окна.
function feedRect() {
  const feeds = document.querySelectorAll('[role="log"][aria-label="Сообщения"]');
  for (const feed of feeds) {
    const r = feed.getBoundingClientRect();
    if (r.width && r.height) return r;
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

/** Запустить самолётик от поля ввода; без анимаций (система или настройка) — ничего. Возвращает, полетел ли. */
export function playSendPlane(anchor: Element | null) {
  if (!anchor || motionReduced()) return false;
  const path = planePath(anchor.getBoundingClientRect(), feedRect());
  const layer = document.createElement("div");
  layer.className = styles.layer!;
  layer.setAttribute("aria-hidden", "true");
  const plane = document.createElement("span");
  plane.className = styles.plane!;
  plane.innerHTML = PLANE_SVG;
  const vars: Record<string, string> = {
    "--start-x": `${path.start[0]}px`,
    "--start-y": `${path.start[1]}px`,
    "--mid-x": `${path.mid[0]}px`,
    "--mid-y": `${path.mid[1]}px`,
    "--mid-rot": `${path.midRot}deg`,
    "--end-x": `${path.end[0]}px`,
    "--end-y": `${path.end[1]}px`,
    "--end-rot": `${path.endRot}deg`,
  };
  for (const [k, v] of Object.entries(vars)) plane.style.setProperty(k, v);
  layer.appendChild(plane);
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), FLIGHT_MS + 100);
  return true;
}

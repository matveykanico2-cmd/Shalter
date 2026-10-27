// Приветствие после входа — как playQrLoginAnimation в main2 (public/js/views/login.js), но короче:
// пузырь «Добро пожаловать в Shalter!» на размытом фоне и самолётик к центру — всего ≤1,2 с
// (в main2 было 1,8 с). Экран не перекрывает ввод (pointer-events: none), переход — по окончании.
import { motionReduced } from "@/shared/lib/motion";

import styles from "./welcome.module.css";

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const PLANE_SVG =
  '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l17-8L4 4l0 6.5L15 12 4 13.5 4 20Z"/></svg>';

/** Вся анимация, мс: появление пузыря, полёт, растворение. */
export const WELCOME_MS = 1150;

type Env = {
  /** Юнит-тесты и автотесты (Playwright: navigator.webdriver) — без анимации, переход сразу. */
  automated?: boolean;
};

const isAutomated = () => import.meta.env.MODE === "test" || (typeof navigator !== "undefined" && navigator.webdriver === true);

/** Сыграть приветствие; промис — когда можно переходить в приложение. */
export function playWelcome({ automated = isAutomated() }: Env = {}): Promise<void> {
  if (automated || motionReduced() || typeof document === "undefined") return Promise.resolve();
  const overlay = document.createElement("div");
  overlay.className = styles.overlay!;
  overlay.innerHTML = `<div class="${styles.bubble}" role="status"><span class="${styles.avatar}">${CHECK_SVG}</span><span class="${styles.text}">Добро пожаловать в Shalter!</span></div><span class="${styles.plane}" aria-hidden="true">${PLANE_SVG}</span>`;
  const plane = overlay.querySelector<HTMLElement>(`.${styles.plane}`)!;
  const w = window.innerWidth;
  const h = window.innerHeight;
  plane.style.setProperty("--start-x", `${w / 2 - 120}px`);
  plane.style.setProperty("--start-y", `${h - 60}px`);
  plane.style.setProperty("--mid-x", `${w / 2 + (Math.random() - 0.5) * 80}px`);
  plane.style.setProperty("--mid-y", `${h / 2 + 140 + (Math.random() - 0.5) * 60}px`);
  plane.style.setProperty("--end-x", `${w / 2}px`);
  plane.style.setProperty("--end-y", `${h / 2 + 60}px`);
  document.body.appendChild(overlay);
  return new Promise((resolve) => {
    setTimeout(() => overlay.classList.add(styles.leaving!), WELCOME_MS - 250);
    setTimeout(() => {
      overlay.remove();
      resolve();
    }, WELCOME_MS);
  });
}

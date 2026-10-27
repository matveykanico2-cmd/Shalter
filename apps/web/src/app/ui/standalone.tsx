import { type ReactNode, useEffect } from "react";

import { hideBootSplash } from "../model/boot-splash";

/** Страницы вне оболочки рисуются сразу — заставка из index.html им не нужна. */
export function Standalone({ children }: { children: ReactNode }) {
  useEffect(hideBootSplash, []);
  return children;
}

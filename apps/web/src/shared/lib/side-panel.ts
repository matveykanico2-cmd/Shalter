import { useNavigate } from "react-router";

import { useMediaQuery } from "./use-media-query";

// Контакты, звонки, архив и настройки на компьютере открываются в колонке списка чатов,
// а справа остаётся то, что было открыто (чат), — как SIDE_ROUTES в public/js/app.js.
// На телефоне это обычные экраны во всю ширину.
const SIDE_ROUTES = ["/contacts", "/calls", "/archive", "/settings"];

export const DESKTOP_QUERY = "(min-width: 768px)";

export const isSidePath = (path: string) => SIDE_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));

let mainPath = "/";

/** Что сейчас справа (пишет оболочка): туда возвращает «Назад» из боковой панели. */
export function setMainPath(path: string) {
  mainPath = path;
}

/** «Назад» из боковой панели: на компьютере — к чату справа, на телефоне — к списку чатов. */
export function useCloseSidePanel() {
  const navigate = useNavigate();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return () => void navigate(desktop ? mainPath : "/");
}

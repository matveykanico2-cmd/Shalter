import { useSyncExternalStore } from "react";

import { getLive, subscribeLive } from "./live-store";

/** Эфир вкладки: сам эфир, его экран и выбор «Начать эфир». */
export const useLive = () => useSyncExternalStore(subscribeLive, getLive);

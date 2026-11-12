import { useQuery } from "@tanstack/react-query";

import { sessionQueries } from "../api/session-queries";
import { readLastSession } from "../lib/last-session";

/**
 * Текущий сеанс. До ответа сервера — сеанс прошлого запуска (isPlaceholderData): экраны
 * приложения рисуются сразу, ответ сервера его подтверждает или заменяет.
 */
export const useSession = () => useQuery({ ...sessionQueries.current(), placeholderData: readLastSession });

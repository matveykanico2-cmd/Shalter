import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/shared/api";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // 4xx — ответ сервера, повтор его не изменит; сеть и 5xx — пробуем ещё.
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      },
    },
  });

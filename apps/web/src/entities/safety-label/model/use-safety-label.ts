import { useQuery } from "@tanstack/react-query";

import { safetyLabelQueries } from "../api/safety-label-queries";
import { safetyLabelInfo } from "../lib/safety-labels";

/** Хук описания метки: каталог грузится один раз на всё приложение. */
export function useSafetyLabel(id: string | null | undefined) {
  const { data } = useQuery({ ...safetyLabelQueries.list(), enabled: !!id });
  return safetyLabelInfo(id, data);
}

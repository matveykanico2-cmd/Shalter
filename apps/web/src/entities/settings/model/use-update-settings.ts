import { useMutation, useQueryClient } from "@tanstack/react-query";

import { errorText } from "@/shared/lib/error-text";
import { toast } from "@/shared/ui";

import { patchSettings, type Settings, settingsQueries } from "../api/settings-queries";

/** Сервер сливает настройки только по верхнему уровню: вложенный объект (privacy…) шлётся целиком. */
export type SettingsPatch = Partial<Settings>;

/**
 * Изменить настройки (PATCH /api/settings): сразу в кэше, ответ сервера — поверх;
 * не сохранилось — откат и тост, как api.patchSettings в старом клиенте.
 */
export function useUpdateSettings() {
  const client = useQueryClient();
  const key = settingsQueries.current().queryKey;
  return useMutation({
    mutationFn: (patch: SettingsPatch) => patchSettings(patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData(key);
      if (before) client.setQueryData(key, { ...before, ...patch });
      return { before };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.before) client.setQueryData(key, ctx.before);
      toast(errorText(err, "Не удалось сохранить настройки"), { error: true });
    },
    onSuccess: (settings) => client.setQueryData(key, settings),
  });
}

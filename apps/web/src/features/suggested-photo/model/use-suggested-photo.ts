import { useCallback } from "react";

import { type Message } from "@/entities/message";
import { useUpdateSelf } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { askConfirm, toast } from "@/shared/ui";

import { suggestedPhotoApi } from "../api/suggested-photo-api";

/** Превью аватарки (data:, 256 px) из фото сообщения — как при своей загрузке аватарки. */
async function posterOf(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Не удалось загрузить фото");
  const blob = await res.blob();
  return fileToImageDataUrl(new File([blob], "photo", { type: blob.type || "image/jpeg" }), 256);
}

/**
 * «Установить как фото профиля» под предложенным в личке фото, как в Telegram: одно
 * касание и подтверждение — фото становится главной аватаркой.
 */
export function useSuggestedPhoto() {
  const updateSelf = useUpdateSelf();
  return useCallback(
    async (message: Message) => {
      const att = message.attachments?.[0] as { url?: string; previewUrl?: string } | undefined;
      const url = att?.previewUrl || att?.url;
      if (!url || !(await askConfirm("Установить это фото как фото профиля?"))) return;
      try {
        const res = await suggestedPhotoApi.apply(message.id, await posterOf(url));
        updateSelf({ avatarImage: res.user.avatarImage, avatarImages: res.user.avatarImages, avatarEmoji: res.user.avatarEmoji });
        toast("Фото профиля обновлено");
      } catch (err) {
        toast(errorText(err, "Не удалось установить фото"), { error: true });
      }
    },
    [updateSelf]
  );
}

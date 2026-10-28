import { useMemo } from "react";

import { audioFor, play } from "@/shared/lib/media/now-playing";

import { AUDIO_EXT_RE } from "../../lib/attachments";
import type { Attachment } from "../../model/attachment";
import type { FeedMessage } from "../../model/types";

import { useMediaProgress } from "./use-media-progress";

/**
 * Голосовое или музыка через общий плеер: тот же <audio> при повторном монтировании,
 * «сейчас играет» над чатом и списком (setNowPlaying в messageBubble.js и attachments.js).
 */
export function usePlayer(message: FeedMessage, a: Attachment, kind: "voice" | "audio", senderName: string | null) {
  const key = `${message.id}:${a.url}`;
  // Голосовое из браузера (WebM) сервер перекодирует в M4A, который перематывается (previewUrl).
  const src = (kind === "voice" ? a.previewUrl : undefined) ?? a.url ?? "";
  // Длительность известна — файл до нажатия не трогаем: лента с голосовыми не открывает
  // десятки соединений ради метаданных.
  const preload = kind === "audio" || (a.durationSec ?? 0) > 0 ? "none" : "metadata";
  const media = useMemo(() => audioFor(key, src, preload), [key, src, preload]);
  const ref = useMemo(() => ({ current: media }), [media]);
  const progress = useMediaProgress(ref, a.durationSec ?? 0);
  const title = kind === "voice" ? (senderName ?? "Голосовое сообщение") : (a.name || "Аудио").replace(AUDIO_EXT_RE, "");
  const toggle = () => {
    if (!media.paused) return media.pause();
    // Не загрузилась (нет доступа, нет сети) — запрашиваем файл заново, а не молчим.
    if (media.error) media.load();
    play(media, {
      key,
      kind,
      title,
      subtitle: kind === "voice" ? "Голосовое сообщение" : (senderName ?? "Музыка"),
      chatId: message.chatId,
      messageId: message.id,
      durationSec: a.durationSec,
    });
  };
  return { key, ref, toggle, ...progress };
}

import { useMemo } from "react";

import { audioFor, play } from "@/shared/lib/media/now-playing";

import type { Attachment } from "../../model/attachment";
import type { FeedMessage } from "../../model/types";

import { useMediaProgress } from "./use-media-progress";

/**
 * Голосовое или музыка через общий плеер: тот же <audio> при повторном монтировании,
 * «сейчас играет» над чатом и списком (setNowPlaying в messageBubble.js и attachments.js).
 */
export function usePlayer(message: FeedMessage, a: Attachment, kind: "voice" | "audio", senderName: string | null) {
  const key = `${message.id}:${a.url}`;
  const media = useMemo(() => audioFor(key, a.url ?? ""), [key, a.url]);
  const ref = useMemo(() => ({ current: media }), [media]);
  const progress = useMediaProgress(ref, a.durationSec ?? 0);
  const title = kind === "voice" ? (senderName ?? "Голосовое сообщение") : (a.name || "Аудио").replace(/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i, "");
  const toggle = () => {
    if (!media.paused) return media.pause();
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

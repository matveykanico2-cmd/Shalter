import type { Sticker } from "@/shared/lib/anim";

/**
 * Что уходит в сообщение — как sendSticker в composer.js (без служебных полей пака).
 * packId — пак стикера: сервер оставит его, если стикер правда оттуда, и по нему клик
 * в ленте откроет окно пака.
 */
export function outgoingSticker(s: Sticker): Sticker {
  const pack = s.packId ? { packId: s.packId } : {};
  if (s.kind === "image") return { kind: "image", url: s.url, name: s.name, uid: s.uid, ...((s as { animated?: true }).animated ? { animated: true } : {}), ...pack } as Sticker;
  if (s.kind === "custom") return { kind: "custom", scene: s.scene, emoji: s.emoji, name: s.name, uid: s.uid, ...pack };
  return { emoji: s.emoji, name: s.name, uid: s.uid, ...(s.anim ? { anim: s.anim } : {}), ...(s.scene ? { scene: s.scene } : {}), ...pack };
}

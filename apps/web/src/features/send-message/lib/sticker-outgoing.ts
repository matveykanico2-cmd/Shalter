import type { Sticker as PackSticker } from "@shalter/shared/schemas/stickers";

import type { Sticker } from "@/shared/lib/anim";

/** Стикер пака (строка /api/stickers/packs) — как картинка-стикер движка анимаций. */
export function packSticker(s: PackSticker | Sticker): Sticker {
  const anim = s as Sticker;
  if (anim.kind) return anim;
  return { ...anim, kind: s.url ? "image" : undefined } as Sticker;
}

/** Что уходит в сообщение — без служебных полей пака. Стикер пака уходит картинкой, а не своим эмодзи. */
export function outgoingSticker(input: PackSticker | Sticker): Sticker {
  const s = packSticker(input);
  const packId = s.packId;
  if (s.kind === "image") {
    return {
      kind: "image",
      url: s.url,
      emoji: s.emoji,
      name: s.name,
      uid: s.uid,
      ...(s.id ? { id: s.id } : {}),
      ...(packId ? { packId } : {}),
      ...((s as { animated?: true }).animated ? { animated: true } : {}),
    } as Sticker;
  }
  if (s.kind === "custom") return { kind: "custom", scene: s.scene, emoji: s.emoji, name: s.name, uid: s.uid, ...(packId ? { packId } : {}) };
  return { emoji: s.emoji, name: s.name, uid: s.uid, ...(packId ? { packId } : {}), ...(s.anim ? { anim: s.anim } : {}), ...(s.scene ? { scene: s.scene } : {}) };
}

/** Убирает повторы: один стикер (id, иначе файл) — один раз. */
export function uniqueStickers<T extends { id?: string; url?: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.url || s.id || "";
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Убирает повторы паков по id. */
export function uniquePacks<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

const preloaded = new Map<string, HTMLImageElement>();
/** Подгружает картинки стикеров заранее, чтобы в панели и в чате они появлялись без пустого кадра. */
export function preloadStickers(urls: (string | undefined)[]) {
  for (const url of urls) {
    if (!url || preloaded.has(url)) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    preloaded.set(url, img);
  }
}

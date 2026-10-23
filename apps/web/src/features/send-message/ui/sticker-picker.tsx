import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { DRAWN_STICKERS, renderSticker, type Sticker, STICKERS } from "@/shared/lib/anim";
import { DomNode, Icon, Menu } from "@/shared/ui";

import { getStickerPacks, sendTyping } from "../api/send-message";

import styles from "./sticker-picker.module.css";

const ACTION_PING_MS = 2500;

/** Что уходит в сообщение — как sendSticker в composer.js (без служебных полей пака). */
function outgoing(s: Sticker): Sticker {
  if (s.kind === "image") return { kind: "image", url: s.url, name: s.name, ...((s as { animated?: true }).animated ? { animated: true } : {}) } as Sticker;
  if (s.kind === "custom") return { kind: "custom", scene: s.scene, emoji: s.emoji, name: s.name };
  return { emoji: s.emoji, name: s.name, ...(s.anim ? { anim: s.anim } : {}), ...(s.scene ? { scene: s.scene } : {}) };
}

type Props = { chatId: string; onSend: (sticker: Sticker) => void };

/**
 * Стикеры — как toggleStickers/renderStickerPicker в composer.js: Shalter, стандартные и
 * свои паки; пока выбор открыт, у собеседника «выбирает стикер». Редактор паков
 * переедет вместе с настройками.
 */
export function StickerButton({ chatId, onSend }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className={styles.button}
        title="Стикеры"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.right - 340, y: r.top - 8 });
        }}
      >
        <Icon name="Sticker" size={21} />
      </button>
      {at ? (
        <Menu
          at={at}
          wide
          label="Стикеры"
          onClose={() => setAt(null)}
          header={
            <StickerPanel
              chatId={chatId}
              onPick={(s) => {
                setAt(null);
                onSend(outgoing(s));
              }}
            />
          }
        />
      ) : null}
    </>
  );
}

function StickerPanel({ chatId, onPick }: { chatId: string; onPick: (s: Sticker) => void }) {
  const packs = useQuery({ queryKey: ["stickers", "packs"], queryFn: getStickerPacks, staleTime: 60_000 });
  useEffect(() => {
    sendTyping(chatId, "choose_sticker").catch(() => {});
    const ping = setInterval(() => sendTyping(chatId, "choose_sticker").catch(() => {}), ACTION_PING_MS);
    return () => {
      clearInterval(ping);
      sendTyping(chatId, "cancel").catch(() => {});
    };
  }, [chatId]);

  const sections: { title: string; stickers: Sticker[] }[] = [
    { title: "Shalter", stickers: DRAWN_STICKERS },
    { title: "Стандартные", stickers: STICKERS },
    ...(packs.data?.packs ?? []).filter((p) => p.stickers.length).map((p) => ({ title: p.name, stickers: p.stickers })),
  ];
  return (
    <div className={styles.panel}>
      {sections.map((section) => (
        <section key={section.title} className={styles.section} aria-label={section.title}>
          <p className={styles.heading}>{section.title}</p>
          <div className={styles.items}>
            {section.stickers.map((s, i) => (
              <button key={`${s.id ?? s.url ?? s.emoji}:${i}`} type="button" className={styles.item} title={s.name || s.emoji || "Стикер"} aria-label={s.name || s.emoji || "Стикер"} onClick={() => onPick(s)}>
                <DomNode create={() => renderSticker(s, { size: s.kind === "image" ? 56 : 30 })} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

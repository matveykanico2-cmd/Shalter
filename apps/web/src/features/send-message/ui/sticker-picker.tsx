import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback,useEffect, useState } from "react";

import { DRAWN_STICKERS, renderSticker, type Sticker, STICKERS } from "@/shared/lib/anim";
import { DomNode, Icon, Menu } from "@/shared/ui";

import { sendTyping } from "../api/send-message";
import { stickerPackQueries } from "../api/sticker-packs";
import { closeStickerPack, openStickerPack, useStickerPackView } from "../lib/sticker-pack-store";

import { StickerPackDetail } from "./sticker-pack-detail";
import { StickerPackDialog } from "./sticker-pack-dialog";
import styles from "./sticker-picker.module.css";

const ACTION_PING_MS = 2500;

/** Что уходит в сообщение — как sendSticker в composer.js (без служебных полей пака). */
function outgoing(s: Sticker): Sticker {
  if (s.kind === "image") return { kind: "image", url: s.url, name: s.name, uid: s.uid, ...((s as { animated?: true }).animated ? { animated: true } : {}) } as Sticker;
  if (s.kind === "custom") return { kind: "custom", scene: s.scene, emoji: s.emoji, name: s.name, uid: s.uid };
  return { emoji: s.emoji, name: s.name, uid: s.uid, ...(s.anim ? { anim: s.anim } : {}), ...(s.scene ? { scene: s.scene } : {}) };
}

type Props = { chatId: string; onSend: (sticker: Sticker) => void };

/**
 * Стикеры — как toggleStickers/renderStickerPicker в composer.js: Shalter, стандартные и
 * свои паки; пока выбор открыт, у собеседника «выбирает стикер». Клик по стикеру из своего
 * пака открывает сам пак (счётчик, удаление стикера/пака, назад), а не отправляет сразу.
 * Внизу — «Мои стикерпаки».
 */
export function StickerButton({ chatId, onSend }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [managing, setManaging] = useState(false);
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
          sheet={false}
          label="Стикеры"
          onClose={() => setAt(null)}
          header={
            <StickerPanel
              chatId={chatId}
              onPick={(s) => {
                setAt(null);
                onSend(outgoing(s));
              }}
              onManage={() => {
                setAt(null);
                setManaging(true);
              }}
            />
          }
        />
      ) : null}
      {managing ? <StickerPackDialog onClose={() => setManaging(false)} /> : null}
    </>
  );
}

function StickerPanel({ chatId, onPick, onManage }: { chatId: string; onPick: (s: Sticker) => void; onManage: () => void }) {
  const client = useQueryClient();
  const packs = useQuery(stickerPackQueries.list());
  const viewingPack = useStickerPackView();
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });
    closeStickerPack();
  }, [client]);

  useEffect(() => {
    sendTyping(chatId, "choose_sticker").catch(() => {});
    const ping = setInterval(() => sendTyping(chatId, "choose_sticker").catch(() => {}), ACTION_PING_MS);
    return () => {
      clearInterval(ping);
      sendTyping(chatId, "cancel").catch(() => {});
    };
  }, [chatId]);

  const pickOwn = (s: Sticker) => {
    onPick(outgoing(s));
    closeStickerPack();
  };

  if (viewingPack) {
    return (
      <div className={styles.panel}>
        <StickerPackDetail
          pack={viewingPack}
          onClose={closeStickerPack}
          onStickerPick={pickOwn}
          onRefresh={refresh}
        />
      </div>
    );
  }

  const sections: { title: string; stickers: Sticker[]; packId?: string }[] = [
    ...(packs.data ?? []).filter((p) => p.stickers.length).map((p) => ({ title: p.name, stickers: p.stickers, packId: p.id })),
    { title: "Shalter", stickers: DRAWN_STICKERS },
    { title: "Стандартные", stickers: STICKERS },
  ];
  return (
    <div className={styles.panel}>
      {sections.map((section) => (
        <section key={section.title} className={styles.section} aria-label={section.title}>
          <p className={styles.heading}>{section.title}</p>
          <div className={styles.items}>
            {section.stickers.map((s, i) => {
              const fromOwnPack = Boolean(section.packId);
              return (
                <button
                  key={`${s.uid ?? s.url ?? s.emoji ?? s.id ?? ""}:${i}`}
                  type="button"
                  className={styles.item}
                  title={s.name || s.emoji || "Стикер"}
                  aria-label={s.name || s.emoji || "Стикер"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (fromOwnPack) {
                      const pack = packs.data?.find((p) => p.id === section.packId);
                      if (pack) {
                        openStickerPack(pack);
                        return;
                      }
                    }
                    onPick(outgoing(s));
                  }}
                >
                  <DomNode create={() => renderSticker(s, { size: s.kind === "image" ? 56 : 30 })} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <button type="button" className={styles.manage} onClick={onManage}>
        Мои стикерпаки
      </button>
    </div>
  );
}

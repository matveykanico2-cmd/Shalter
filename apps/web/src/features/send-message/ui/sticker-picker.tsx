import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { renderSticker, type Sticker } from "@/shared/lib/anim";
import { DomNode, Icon, Menu } from "@/shared/ui";

import { sendTyping } from "../api/send-message";
import { type StickerPack, stickerPackQueries } from "../api/sticker-packs";
import { closeStickerPack, useStickerPackView } from "../lib/sticker-pack-store";

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
 * Стикеры — только свои стикерпаки пользователя (без встроенных наборов).
 * Каждый пак показывает название, описание и сетку стикеров.
 * Клик по стикеру отправляет его в чат.
 * Внизу — «Мои стикерпаки» (создать/редактировать/удалить пак).
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

  const pick = (s: Sticker) => {
    onPick(outgoing(s));
    closeStickerPack();
  };

  if (viewingPack) {
    return (
      <div className={styles.panel}>
        <StickerPackDetail
          pack={viewingPack}
          onClose={closeStickerPack}
          onStickerPick={pick}
          onRefresh={refresh}
        />
      </div>
    );
  }

  const list = (packs.data ?? []).filter((p: StickerPack) => p.stickers.length);
  return (
    <div className={styles.panel}>
      {list.length === 0 ? (
        <p className={styles.empty}>У вас пока нет стикерпаков</p>
      ) : (
        <>
          {list.map((pack: StickerPack) => (
            <section key={pack.id} className={styles.packSection} aria-label={pack.name}>
              <div className={styles.packHeader}>
                <span className={styles.packName}>{pack.name}</span>
                {pack.description && <span className={styles.packDesc}>{pack.description}</span>}
              </div>
              <div className={styles.items}>
                {pack.stickers.map((s) => (
                  <button
                    key={s.id || s.url || s.emoji}
                    type="button"
                    className={styles.item}
                    title={s.emoji || "Стикер"}
                    aria-label={s.emoji || "Стикер"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      pick(s);
                    }}
                  >
                    <DomNode create={() => renderSticker(s, { size: 56 })} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      <button type="button" className={styles.manage} onClick={onManage}>
        Мои стикерпаки
      </button>
    </div>
  );
}

import type { Sticker as PackStickerT } from "@shalter/shared/schemas/stickers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { renderSticker, type Sticker } from "@/shared/lib/anim";
import { DomNode, Icon, Menu } from "@/shared/ui";

import { sendTyping } from "../api/send-message";
import { type StickerPack, stickerPackQueries } from "../api/sticker-packs";
import {
  outgoingSticker,
  packSticker,
  preloadStickers,
  uniquePacks,
  uniqueStickers,
} from "../lib/sticker-outgoing";
import {
  closeStickerPack,
  useStickerPackView,
} from "../lib/sticker-pack-store";

import { BuiltinStickerPacks } from "./builtin-sticker-packs";
import { PackCover, StickerPackDetail } from "./sticker-pack-detail";
import { StickerPackDialog } from "./sticker-pack-dialog";
import styles from "./sticker-picker.module.css";

const ACTION_PING_MS = 2500;

type Props = { chatId: string; onSend: (sticker: Sticker) => void };

/**
 * Панель стикеров в чате: только свои стикерпаки пользователя.
 * Показывает название, описание и чистую сетку стикеров.
 * Клик по стикеру отправляет его в чат.
 * «Мои стикерпаки» — создание/редактирование/удаление.
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
          setAt({ x: r.right - 360, y: r.top - 6 });
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
                onSend(outgoingSticker(s));
              }}
              onManage={() => {
                setAt(null);
                setManaging(true);
              }}
            />
          }
        />
      ) : null}
      {managing ? (
        <StickerPackDialog onClose={() => setManaging(false)} />
      ) : null}
    </>
  );
}

function StickerPanel({
  chatId,
  onPick,
  onManage,
}: {
  chatId: string;
  onPick: (s: Sticker | PackStickerT) => void;
  onManage: () => void;
}) {
  const client = useQueryClient();
  const packs = useQuery(stickerPackQueries.list());
  const viewingPack = useStickerPackView();
  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });
    closeStickerPack();
  }, [client]);

  useEffect(() => {
    sendTyping(chatId, "choose_sticker").catch(() => {});
    const ping = setInterval(
      () => sendTyping(chatId, "choose_sticker").catch(() => {}),
      ACTION_PING_MS,
    );
    return () => {
      clearInterval(ping);
      sendTyping(chatId, "cancel").catch(() => {});
    };
  }, [chatId]);

  const list = useMemo(
    () =>
      uniquePacks(packs.data ?? [])
        .map((p: StickerPack) => ({
          ...p,
          stickers: uniqueStickers(p.stickers),
        }))
        .filter((p) => p.stickers.length)
        // Сначала свои наборы, потом добавленные.
        .sort((a, b) => Number(b.isOwner) - Number(a.isOwner)),
    [packs.data],
  );
  // Картинки всех паков — заранее, чтобы при прокрутке не было пустых клеток.
  useEffect(
    () => preloadStickers(list.flatMap((p) => p.stickers.map((s) => s.url))),
    [list],
  );

  const pick = (s: Sticker | PackStickerT) => {
    onPick(outgoingSticker(s));
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

  return (
    <div className={styles.panel}>
      {list.length === 0 ? (
        null
      ) : (
        <>
          {list.map((pack: StickerPack, i) => (
            <Fragment key={pack.id}>
              {i === 0 || list[i - 1]!.isOwner !== pack.isOwner ? (
                <h3 className={styles.heading}>
                  {pack.isOwner ? "Мои наборы" : "Добавленные"}
                </h3>
              ) : null}
              <section className={styles.packSection} aria-label={pack.name}>
                <div className={styles.packHeader}>
                  <PackCover pack={pack} size={28} />
                  <span className={styles.packName}>{pack.name}</span>
                  {pack.description && (
                    <span className={styles.packDesc}>{pack.description}</span>
                  )}
                  <span className={styles.packMeta}>
                    {pack.stickers.length} шт.
                  </span>
                </div>
                <div className={styles.items}>
                  {pack.stickers.map((s) => (
                    <button
                      key={s.id}
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
                      <DomNode
                        key={s.url}
                        create={() =>
                          renderSticker(packSticker(s), { size: 52 })
                        }
                      />
                    </button>
                  ))}
                </div>
              </section>
            </Fragment>
          ))}
        </>
      )}
      <BuiltinStickerPacks onPick={pick} />
      <button type="button" className={styles.manage} onClick={onManage}>
        Мои стикерпаки
      </button>
    </div>
  );
}

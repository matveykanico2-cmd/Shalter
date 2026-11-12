import type { Sticker as PackStickerT } from "@shalter/shared/schemas/stickers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type BuiltinStickerPack, renderSticker, type Sticker } from "@/shared/lib/anim";
import { useLongPress } from "@/shared/lib/use-long-press";
import { DomNode, Icon, Menu } from "@/shared/ui";

import { sendTyping } from "../api/send-message";
import { type StickerPack, stickerPackQueries } from "../api/sticker-packs";
import { BUILTIN_STICKER_PACKS } from "../lib/builtin-packs";
import {
  outgoingSticker,
  packSticker,
  preloadStickers,
  uniquePacks,
  uniqueStickers,
} from "../lib/sticker-outgoing";
import {
  closeStickerPack,
} from "../lib/sticker-pack-store";

import { BuiltinStickerPacks } from "./builtin-sticker-packs";
import { PackCover, StickerPackDetail } from "./sticker-pack-detail";
import { StickerPackDialog } from "./sticker-pack-dialog";
import styles from "./sticker-picker.module.css";

const ACTION_PING_MS = 2500;

type OpenedPack = { pack?: StickerPack; builtin?: BuiltinStickerPack };

type Props = { chatId: string; onSend: (sticker: Sticker) => void };

/**
 * Панель стикеров в чате: только свои стикерпаки пользователя.
 * Показывает название, описание и чистую сетку стикеров.
 * Клик по стикеру отправляет его в чат.
 * «Мои стикерпаки» — создание/редактирование/удаление.
 */
export function StickerButton({ chatId, onSend }: Props) {
  const client = useQueryClient();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [managing, setManaging] = useState(false);
  // Пак, открытый из панели, — своё окно у кнопки: не зависит от ленты чата и не двоится с её окном.
  const [sheet, setSheet] = useState<OpenedPack | null>(null);
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
              onOpenPack={(opened) => {
                setAt(null);
                setSheet(opened);
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
      {sheet ? (
        <StickerPackDetail
          overlay
          pack={sheet.pack ?? null}
          builtin={sheet.builtin ?? null}
          onClose={() => setSheet(null)}
          onStickerPick={(s) => onSend(outgoingSticker(s))}
          onBuiltinPick={(s) => onSend(outgoingSticker(s))}
          onRefresh={() => {
            // Пак правили или удалили — список панели перечитывается.
            void client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });
            setSheet(null);
          }}
        />
      ) : null}
    </>
  );
}

function StickerPanel({
  chatId,
  onPick,
  onManage,
  onOpenPack,
}: {
  chatId: string;
  onPick: (s: Sticker | PackStickerT) => void;
  onManage: () => void;
  onOpenPack: (opened: OpenedPack) => void;
}) {
  const packs = useQuery(stickerPackQueries.list());

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
  // Долгое нажатие (правый клик) — стикер крупно, без отправки.
  const [preview, setPreview] = useState<PackStickerT | null>(null);

  const body = useRef<HTMLDivElement>(null);
  const jump = (id: string) => body.current?.querySelector<HTMLElement>(`[data-pack="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });

  return (
    <div className={styles.panel}>
      {preview ? (
        <StickerPreview
          sticker={preview}
          onClose={() => setPreview(null)}
          onSend={() => {
            setPreview(null);
            pick(preview);
          }}
        />
      ) : null}
      {/* Вкладки паков, как в Telegram: обложка пака — прокрутка к нему; в конце — управление. */}
      <div className={styles.tabs} role="toolbar" aria-label="Стикерпаки">
        {list.map((pack) => (
          <button key={pack.id} type="button" className={styles.tab} title={pack.name} aria-label={pack.name} onClick={() => jump(pack.id)}>
            <PackCover pack={pack} size={32} />
          </button>
        ))}
        {BUILTIN_STICKER_PACKS.map((pack) => (
          <button key={pack.id} type="button" className={styles.tab} title={pack.name} aria-label={pack.name} onClick={() => jump(pack.id)}>
            <span className={styles.tabCover} aria-hidden="true">
              <DomNode create={() => renderSticker(pack.stickers[0]!, { size: 28 })} />
            </span>
          </button>
        ))}
        <button type="button" className={`${styles.tab} ${styles.tabManage}`} title="Мои стикерпаки" aria-label="Мои стикерпаки" onClick={onManage}>
          <Icon name="Settings" size={18} />
        </button>
      </div>
      <div ref={body} className={styles.panelBody}>
        {list.map((pack: StickerPack, i) => (
          <Fragment key={pack.id}>
            {i === 0 || list[i - 1]!.isOwner !== pack.isOwner ? <h3 className={styles.heading}>{pack.isOwner ? "Мои наборы" : "Добавленные"}</h3> : null}
            <section className={styles.packSection} aria-label={pack.name} data-pack={pack.id}>
              <button type="button" className={styles.packHeader} title="Открыть пак" aria-label={`Открыть пак «${pack.name}»`} onClick={() => onOpenPack({ pack })}>
                <span className={styles.packName}>{pack.name}</span>
                <span className={styles.packMeta}>{pack.stickers.length}</span>
              </button>
              <div className={styles.items}>
                {pack.stickers.map((s) => (
                  <StickerTile key={s.id} sticker={s} onPick={pick} onPreview={setPreview} />
                ))}
              </div>
            </section>
          </Fragment>
        ))}
        <BuiltinStickerPacks onPick={pick} onOpen={(builtin) => onOpenPack({ builtin })} />
        {!list.length ? (
          <button type="button" className={styles.manage} onClick={onManage}>
            Создать свой стикерпак
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Стикер в панели: нажатие — отправить, долгое нажатие или правый клик — посмотреть крупно. */
function StickerTile({ sticker, onPick, onPreview }: { sticker: PackStickerT; onPick: (s: PackStickerT) => void; onPreview: (s: PackStickerT) => void }) {
  const hold = useLongPress(() => onPreview(sticker));
  return (
    <button
      type="button"
      className={styles.item}
      title={sticker.emoji || "Стикер"}
      aria-label={sticker.emoji || "Стикер"}
      onPointerDown={hold.onPointerDown}
      onPointerMove={hold.onPointerMove}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!hold.swallow(e)) onPreview(sticker);
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!hold.swallow(e)) onPick(sticker);
      }}
    >
      <DomNode key={sticker.url} create={() => renderSticker(packSticker(sticker), { size: 56 })} />
    </button>
  );
}

/** Предпросмотр: стикер крупно с эмодзи; «Отправить» или нажатие мимо — закрыть. */
function StickerPreview({ sticker, onClose, onSend }: { sticker: PackStickerT; onClose: () => void; onSend: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className={styles.preview}
      role="dialog"
      aria-modal="true"
      aria-label={`Стикер ${sticker.emoji || ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.previewCard}>
        <DomNode key={sticker.url} create={() => renderSticker(packSticker(sticker), { size: 200, replay: true })} />
        {sticker.emoji ? <span className={styles.previewEmoji}>{sticker.emoji}</span> : null}
        <button type="button" className={styles.previewSend} onClick={onSend}>
          Отправить
        </button>
      </div>
    </div>,
    document.body
  );
}

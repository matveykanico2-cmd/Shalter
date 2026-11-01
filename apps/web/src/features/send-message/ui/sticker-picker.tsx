import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback,useEffect, useState } from "react";

import { DRAWN_STICKERS, renderSticker, type Sticker, STICKERS } from "@/shared/lib/anim";
import { askConfirm, DomNode, Icon, Menu, toast } from "@/shared/ui";

import { sendTyping } from "../api/send-message";
import { stickerPackQueries, uninstallStickerPack } from "../api/sticker-packs";
import { outgoingSticker } from "../lib/outgoing-sticker";
import { closeStickerPack, openStickerPack, useStickerPackView } from "../lib/sticker-pack-store";

import { StickerPackDetail } from "./sticker-pack-detail";
import { StickerPackDialog } from "./sticker-pack-dialog";
import styles from "./sticker-picker.module.css";

const ACTION_PING_MS = 2500;

type Props = { chatId: string; meId: string; onSend: (sticker: Sticker) => void };

/**
 * Стикеры — как в Telegram: Shalter, стандартные, свои и добавленные себе паки; клик по
 * стикеру отправляет его. Пока выбор открыт, у собеседника «выбирает стикер». У своего пака
 * в заголовке — «изменить» (счётчик, удаление стикера/пака), у добавленного — «убрать».
 * Внизу — «Мои стикерпаки».
 */
export function StickerButton({ chatId, meId, onSend }: Props) {
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
          label="Стикеры"
          onClose={() => setAt(null)}
          header={
            <StickerPanel
              chatId={chatId}
              meId={meId}
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
      {managing ? <StickerPackDialog meId={meId} onClose={() => setManaging(false)} /> : null}
    </>
  );
}

function StickerPanel({ chatId, meId, onPick, onManage }: { chatId: string; meId: string; onPick: (s: Sticker) => void; onManage: () => void }) {
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
    onPick(outgoingSticker(s));
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

  const removeInstalled = async (id: string, name: string) => {
    if (!(await askConfirm(`Убрать стикерпак «${name}» из своих?`, { okLabel: "Убрать", danger: true }))) return;
    try {
      await uninstallStickerPack(id);
      refresh();
    } catch {
      toast("Не получилось убрать стикерпак");
    }
  };

  const sections: { title: string; stickers: Sticker[]; packId?: string; own?: boolean }[] = [
    { title: "Shalter", stickers: DRAWN_STICKERS },
    { title: "Стандартные", stickers: STICKERS },
    ...(packs.data ?? []).filter((p) => p.stickers.length).map((p) => ({ title: p.name, stickers: p.stickers, packId: p.id, own: p.ownerId === meId })),
  ];
  return (
    <div className={styles.panel}>
      {sections.map((section) => (
        <section key={section.packId ?? section.title} className={styles.section} aria-label={section.title}>
          <div className={styles.headingRow}>
            <p className={styles.heading}>{section.title}</p>
            {section.packId && section.own ? (
              <button
                type="button"
                className={styles.headingAction}
                title="Изменить пак"
                aria-label={`Изменить пак «${section.title}»`}
                onClick={() => {
                  const pack = packs.data?.find((p) => p.id === section.packId);
                  if (pack) openStickerPack(pack);
                }}
              >
                <Icon name="Edit" size={13} />
              </button>
            ) : section.packId ? (
              <button
                type="button"
                className={styles.headingAction}
                title="Убрать пак"
                aria-label={`Убрать пак «${section.title}»`}
                onClick={() => void removeInstalled(section.packId!, section.title)}
              >
                <Icon name="X" size={13} />
              </button>
            ) : null}
          </div>
          <div className={styles.items}>
            {section.stickers.map((s, i) => (
              <button
                key={`${s.uid ?? s.url ?? s.emoji ?? s.id ?? ""}:${i}`}
                type="button"
                className={styles.item}
                title={s.name || s.emoji || "Стикер"}
                aria-label={s.name || s.emoji || "Стикер"}
                onClick={() => onPick(outgoingSticker(section.packId ? { ...s, packId: section.packId } : s))}
              >
                <DomNode create={() => renderSticker(s, { size: s.kind === "image" ? 56 : 30 })} />
              </button>
            ))}
          </div>
        </section>
      ))}
      <button type="button" className={styles.manage} onClick={onManage}>
        Мои стикерпаки
      </button>
    </div>
  );
}

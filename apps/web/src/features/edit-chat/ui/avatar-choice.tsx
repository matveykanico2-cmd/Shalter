import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { http } from "@/shared/api";
import { hasAnimatedEmoji, renderSticker, type Sticker } from "@/shared/lib/anim";
import { ALL_EMOJI } from "@/shared/lib/emoji-list";
import { Button, Dialog, DomNode } from "@/shared/ui";

import styles from "./edit-chat.module.css";

type Tab = "emoji" | "stickers";

type Pick = { kind: "emoji"; emoji: string } | { kind: "sticker"; sticker: Sticker; packId: string | null };

type PackSticker = { id: string; packId: string; file: string; emoji: string; position: number; createdAt: string };

type Pack = {
  id: string;
  name: string;
  description: string | null;
  stickers: PackSticker[];
  stickerCount: number;
  isAdded: boolean;
  isOwner: boolean;
  createdAt: string;
};

type Props = { onPick: (p: Pick) => void; onClose: () => void };

const packsQuery = () =>
  ({
    queryKey: ["stickers", "packs"] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      (await http.get<{ packs: Pack[] }>("/api/stickers/packs", signal)).packs,
    staleTime: 60_000,
  } as const);

/** Выбор аватара группы — модальное окно с фиксированной высотой и вкладками «Смайлы» / «Стикеры». */
export function AvatarChoice({ onPick, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("emoji");
  const [pack, setPack] = useState<Pack | null>(null);
  const [selected, setSelected] = useState<Pick | null>(null);
  const packs = useQuery(packsQuery());
  const own = (packs.data ?? []).filter((p) => p.isAdded);

  const tabPressed = (t: Tab) => {
    setTab(t);
    if (t === "stickers") setPack(null);
  };

  const pickEmoji = (emoji: string) => {
    setSelected({ kind: "emoji", emoji });
    onPick({ kind: "emoji", emoji });
  };

  const pickSticker = (s: PackSticker) => {
    const sticker: Sticker = { id: s.id, kind: "image", url: s.file, emoji: s.emoji, name: s.emoji };
    setSelected({ kind: "sticker", sticker, packId: pack?.id ?? null });
    onPick({ kind: "sticker", sticker, packId: pack?.id ?? null });
  };

  const hasSelection = !!selected;
  const ready = tab === "emoji" || Boolean(pack);

  const selectedSticker = selected?.kind === "sticker" ? selected.sticker : null;

  return (
    <Dialog title="Аватар группы" onClose={onClose} className={styles.avatarSheet}>
      <div className={styles.avatarSheetTabs}>
        <button type="button" className={tab === "emoji" ? `${styles.sheetTab} ${styles.sheetTabOn}` : styles.sheetTab} onClick={() => tabPressed("emoji")}>
          Смайлы
        </button>
        <button type="button" className={tab === "stickers" ? `${styles.sheetTab} ${styles.sheetTabOn}` : styles.sheetTab} onClick={() => tabPressed("stickers")}>
          Стикеры
        </button>
      </div>
      <div className={styles.avatarSheetBody}>
        {tab === "emoji" ? <EmojiTab onPick={pickEmoji} /> : <StickersTab packs={own} pack={pack} setPack={setPack} selected={selectedSticker} onPick={pickSticker} />}
      </div>
      <div className={styles.avatarSheetFooter}>
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
        <Button disabled={!hasSelection || !ready} onClick={() => onClose()}>
          Выбрать
        </Button>
      </div>
    </Dialog>
  );
}

function EmojiTab({ onPick }: { onPick: (emoji: string) => void }) {
  const [custom, setCustom] = useState("");
  return (
    <div className={styles.emojiTab}>
      <p className={styles.emojiLabel}>Смайл на заставке</p>
      <div className={styles.emojiGrid}>
        {EMOJIS.map((e) => (
          <button key={e} type="button" className={styles.emoji} title={e} onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
      <div className={styles.emojiCustom}>
        <input className={styles.emojiInput} maxLength={10} placeholder="свой смайл" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button type="button" className={styles.emojiApply} onClick={() => onPick(custom.trim())}>
          Установить
        </button>
      </div>
    </div>
  );
}

function StickersTab({
  packs,
  pack,
  setPack,
  selected,
  onPick,
}: {
  packs: Pack[];
  pack: Pack | null;
  setPack: (p: Pack | null) => void;
  selected: Sticker | null;
  onPick: (s: PackSticker) => void;
}) {
  return (
    <div className={styles.stickersTab}>
      <p className={styles.emojiLabel}>Стикер на заставке</p>
      {packs.length ? (
        <>
          <div className={styles.packRow}>
            <span className={styles.packLabel}>Пак:</span>
            {packs.map((p) => (
              <button key={p.id} type="button" className={pack?.id === p.id ? `${styles.pill} ${styles.pillOn}` : styles.pill} onClick={() => setPack(p)}>
                {p.name}
              </button>
            ))}
          </div>
          {pack ? (
            <div className={styles.emojiGrid}>
              {pack.stickers.map((s) => {
                const active = selected ? selected.url === s.file && selected.emoji === s.emoji : false;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={active ? `${styles.emoji} ${styles.emojiOn}` : styles.emoji}
                    title={s.emoji}
                    aria-label={s.emoji}
                    onClick={() => onPick(s)}
                  >
                    <DomNode create={() => renderSticker({ id: s.id, kind: "image", url: s.file, emoji: s.emoji, name: s.emoji }, { size: 44 })} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className={styles.empty}>Выберите пак выше</p>
          )}
        </>
      ) : (
        <p className={styles.empty}>У вас пока нет стикерпаков. Создайте их в окне «Стикеры» в поле ввода сообщения.</p>
      )}
    </div>
  );
}

/** Все существующие эмодзи для заставки — анимированные где есть (как в Telegram). */
const EMOJIS = ALL_EMOJI.filter(hasAnimatedEmoji);

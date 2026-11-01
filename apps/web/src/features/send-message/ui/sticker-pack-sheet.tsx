import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { ApiError } from "@/shared/api";
import { renderSticker, type Sticker } from "@/shared/lib/anim";
import { plural } from "@/shared/lib/presence";
import { Dialog, DomNode, toast } from "@/shared/ui";

import { installStickerPack, type StickerPack, stickerPackQueries, uninstallStickerPack } from "../api/sticker-packs";
import { type BuiltinPack, builtinPackOf } from "../lib/builtin-packs";

import styles from "./sticker-pack-sheet.module.css";

type Props = {
  /** Стикер, по которому открыли окно (из ленты). */
  sticker: Sticker;
  meId: string;
  onSend: (s: Sticker) => void;
  /** Свой пак — «Изменить пак». */
  onEdit: (pack: StickerPack) => void;
  onClose: () => void;
};

const count = (n: number) => `${n} ${plural(n, "стикер", "стикера", "стикеров")}`;

/**
 * Окно стикерпака по клику на стикер в ленте — как в Telegram: название, описание, все
 * стикеры (клик — отправить), внизу «Добавить N стикеров» или «Удалить N стикеров».
 * Встроенные наборы есть у всех; свой пак — «Изменить пак».
 */
export function StickerPackSheet({ sticker, meId, onSend, onEdit, onClose }: Props) {
  const builtin = builtinPackOf(sticker);
  const own = useQuery({ ...stickerPackQueries.list(), enabled: !builtin && !sticker.packId });
  // Старые сообщения без packId: ищем пак по метке или картинке среди своих и добавленных.
  const packId = sticker.packId ?? own.data?.find((p) => p.stickers.some((s) => (sticker.uid && s.uid === sticker.uid) || (sticker.url && s.url === sticker.url)))?.id;
  const view = useQuery({ ...stickerPackQueries.view(packId ?? ""), enabled: !!packId });

  if (builtin) return <Sheet pack={builtin} onSend={onSend} onClose={onClose} footer={<p className={styles.note}>Этот набор есть у всех</p>} />;
  if (!packId) {
    const loading = !sticker.packId && own.isPending;
    return (
      <Dialog title="Стикер" onClose={onClose} className={styles.sheet}>
        <div className={styles.single}>
          <DomNode create={() => renderSticker(sticker, { size: 120 })} />
        </div>
        <p className={styles.note}>{loading ? "Ищем пак…" : "Этот стикер не из стикерпака"}</p>
      </Dialog>
    );
  }
  if (view.isError) {
    const gone = view.error instanceof ApiError && view.error.status === 404;
    return (
      <Dialog title="Стикерпак" onClose={onClose} className={styles.sheet}>
        <p className={styles.note}>{gone ? "Автор удалил этот стикерпак" : "Не удалось открыть стикерпак"}</p>
      </Dialog>
    );
  }
  if (!view.data) {
    return (
      <Dialog title="Стикерпак" onClose={onClose} className={styles.sheet}>
        <p className={styles.note}>Загрузка…</p>
      </Dialog>
    );
  }
  const { pack, installed } = view.data;
  const stickers = pack.stickers.map((s) => ({ ...s, packId: pack.id }));
  return (
    <Sheet
      pack={{ ...pack, stickers }}
      onSend={onSend}
      onClose={onClose}
      footer={pack.ownerId === meId ? <EditButton onClick={() => onEdit(pack)} /> : <InstallButton pack={pack} installed={installed} />}
    />
  );
}

function Sheet({ pack, footer, onSend, onClose }: { pack: Pick<BuiltinPack, "name" | "description" | "stickers">; footer: ReactNode; onSend: (s: Sticker) => void; onClose: () => void }) {
  return (
    <Dialog title={pack.name} onClose={onClose} className={styles.sheet}>
      <p className={styles.count}>{count(pack.stickers.length)}</p>
      {pack.description ? <p className={styles.description}>{pack.description}</p> : null}
      <div className={styles.grid}>
        {pack.stickers.map((s, i) => (
          <button
            key={`${s.uid ?? s.url ?? s.id ?? s.emoji ?? ""}:${i}`}
            type="button"
            className={styles.item}
            title={s.name || s.emoji || "Стикер"}
            aria-label={`Отправить «${s.name || s.emoji || "стикер"}»`}
            onClick={() => {
              onSend(s);
              onClose();
            }}
          >
            <DomNode create={() => renderSticker(s, { size: s.kind === "image" ? 64 : 44 })} />
          </button>
        ))}
      </div>
      <div className={styles.footer}>{footer}</div>
    </Dialog>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.action} onClick={onClick}>
      Изменить пак
    </button>
  );
}

function InstallButton({ pack, installed }: { pack: StickerPack; installed: boolean }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (installed) await uninstallStickerPack(pack.id);
      else await installStickerPack(pack.id);
      await client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });
      toast(installed ? `Стикерпак «${pack.name}» удалён` : `Стикерпак «${pack.name}» добавлен`);
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "Не получилось — попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };
  const n = pack.stickers.length;
  return (
    <button type="button" className={installed ? `${styles.action} ${styles.danger}` : styles.action} disabled={busy} onClick={() => void toggle()}>
      {installed ? `Удалить ${count(n)}` : `Добавить ${count(n)}`}
    </button>
  );
}

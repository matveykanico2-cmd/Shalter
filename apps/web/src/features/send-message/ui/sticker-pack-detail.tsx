import type { Sticker } from "@shalter/shared/schemas/stickers";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { uploadFile } from "@/shared/api";
import { type BuiltinStickerPack, renderSticker, type Sticker as AnimSticker } from "@/shared/lib/anim";
import { errorText } from "@/shared/lib/error-text";
import { Button, DomNode, Icon } from "@/shared/ui";

import {
  addSticker,
  deleteStickerPack,
  removeSticker,
  type StickerPack,
  stickerPackQueries,
  updateSticker,
  updateStickerPack,
} from "../api/sticker-packs";
import { prepareStickerImage } from "../lib/sticker-image";
import {
  packSticker,
  preloadStickers,
  uniqueStickers,
} from "../lib/sticker-outgoing";

import { PaintDialog } from "./paint-dialog";
import styles from "./sticker-picker.module.css";

const stickerWord = (n: number) => {
  const word =
    n % 100 >= 11 && n % 100 <= 14
      ? "стикеров"
      : n % 10 === 1
        ? "стикер"
        : n % 10 >= 2 && n % 10 <= 4
          ? "стикера"
          : "стикеров";
  return `${n} ${word}`;
};

/** Стикер-обложка: выбранный владельцем, иначе первый. */
const coverSticker = (pack: StickerPack) =>
  (pack.coverStickerId
    ? pack.stickers.find((s) => s.id === pack.coverStickerId)
    : undefined) ?? pack.stickers[0];

/** Обложка пака — выбранный стикер, иначе первый (или буква названия, пока стикеров нет). */
export function PackCover({
  pack,
  size = 44,
}: {
  pack: StickerPack;
  size?: number;
}) {
  const cover = coverSticker(pack);
  return (
    <span
      className={styles.cover}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {cover ? (
        <DomNode
          key={cover.url}
          create={() => renderSticker(packSticker(cover), { size: size - 6 })}
        />
      ) : (
        <span className={styles.coverLetter}>
          {pack.name.slice(0, 1).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}

/** Нажатый в чате стикер — крупно, на своём фоне (фон сцены или подложка в цвет чата). */
function StickerStage({ sticker }: { sticker: AnimSticker }) {
  const s = packSticker(sticker);
  const scene = s.scene as { bg?: string | null } | undefined;
  const bg =
    s.kind === "custom" && scene && typeof scene === "object" && scene.bg
      ? scene.bg
      : undefined;
  return (
    <div
      className={styles.stage}
      style={bg ? { background: bg } : undefined}
      data-testid="sticker-stage"
    >
      <DomNode
        key={s.url || s.emoji}
        create={() => renderSticker(s, { size: 180, replay: true })}
        label={s.emoji || "Стикер"}
      />
    </div>
  );
}

/**
 * Редактор стикеров пака (только владелец): у каждого стикера свой эмодзи (для поиска и подсказок),
 * порядок, удаление; добавление картинкой (PNG/WebP/JPEG → WebP/PNG до 512 px) или рисунком.
 */
export function StickerGridEditor({
  pack,
  onChange,
}: {
  pack: StickerPack;
  /** saved — сервер уже сохранил (можно перечитать список паков); false — пока только на экране. */
  onChange: (pack: StickerPack, saved: boolean) => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [painting, setPainting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Загрузки идут по одной: так стикеры встают по порядку и один файл не уходит дважды.
  const latest = useRef(pack);
  useEffect(() => {
    latest.current = pack;
  }, [pack]);
  const queue = useRef(Promise.resolve());

  /** Новый список стикеров; save — сервер уже сохранил (список паков перечитываем только тогда). */
  const commit = (stickers: Sticker[], { save = true } = {}) => {
    const list = uniqueStickers(stickers);
    const base = { ...latest.current, stickers: list, stickerCount: list.length };
    // Обложка — как на сервере: выбранный стикер, иначе первый (после перестановки — новый первый).
    const next = { ...base, cover: coverSticker(base)?.url ?? null };
    latest.current = next;
    onChange(next, save);
  };

  const addFiles = (files: File[]) => {
    for (const raw of files) {
      setUploading((n) => n + 1);
      queue.current = queue.current.then(async () => {
        try {
          const { file } = await prepareStickerImage(raw);
          const { url } = await uploadFile(file, "image");
          const { sticker } = await addSticker(latest.current.id, {
            file: url,
            emoji: "🙂",
          });
          commit([...latest.current.stickers, sticker]);
        } catch (err) {
          setError(errorText(err, "Не удалось добавить стикер"));
        } finally {
          setUploading((n) => n - 1);
        }
      });
    }
  };

  const setEmoji = async (s: Sticker, emoji: string) => {
    const value = emoji.trim();
    if (!value || value === s.emoji) return;
    try {
      const { sticker } = await updateSticker(latest.current.id, s.id, {
        emoji: value,
      });
      commit(latest.current.stickers.map((x) => (x.id === s.id ? sticker : x)));
    } catch (err) {
      setError(errorText(err, "Не удалось сменить эмодзи"));
    }
  };

  const remove = async (s: Sticker) => {
    try {
      await removeSticker(latest.current.id, s.id);
      commit(latest.current.stickers.filter((x) => x.id !== s.id));
    } catch (err) {
      setError(errorText(err, "Не удалось убрать стикер"));
    }
  };

  const makeCover = async (s: Sticker) => {
    try {
      const { pack: saved } = await updateStickerPack(latest.current.id, {
        coverStickerId: s.id,
      });
      const next = { ...latest.current, coverStickerId: saved.coverStickerId ?? s.id, cover: saved.cover ?? s.url };
      latest.current = next;
      onChange(next, true);
    } catch (err) {
      setError(errorText(err, "Не удалось сменить обложку"));
    }
  };

  const moveTo = async (s: Sticker, target: number) => {
    const list = [...latest.current.stickers];
    const idx = list.findIndex((x) => x.id === s.id);
    const to = Math.min(Math.max(0, target), list.length - 1);
    if (idx < 0 || to === idx) return;
    const [moved] = list.splice(idx, 1);
    if (!moved) return;
    list.splice(to, 0, moved);
    // Сразу на экране; список паков (обложки во вкладках) — когда сервер сохранил порядок,
    // иначе перезапрос успевал раньше и возвращал прежнюю обложку.
    commit(
      list.map((x, i) => ({ ...x, position: i })),
      { save: false }
    );
    try {
      await Promise.all(list.map((x, i) => (x.position === i ? null : updateSticker(latest.current.id, x.id, { position: i }))));
      commit(latest.current.stickers);
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить порядок"));
    }
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const cover = coverSticker(pack);
  const selectedIndex = pack.stickers.findIndex((x) => x.id === selectedId);
  const selected = selectedIndex >= 0 ? pack.stickers[selectedIndex] : undefined;

  return (
    <div className={styles.editor}>
      <p className={styles.hint}>
        Нажмите на стикер, чтобы поменять эмодзи, порядок или сделать его обложкой. На компьютере
        стикеры можно перетаскивать. Обложка пака отмечена звездой (по умолчанию — первый стикер).
      </p>
      <div className={styles.editGrid} role="list" aria-label="Стикеры пака">
        {pack.stickers.map((s, i) => (
          <div
            key={s.id}
            role="listitem"
            className={[styles.editCell, s.id === selectedId ? styles.editCellSelected : "", s.id === dragId ? styles.editCellDragging : ""].filter(Boolean).join(" ")}
            draggable
            onDragStart={(e) => {
              setDragId(s.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              if (dragId && dragId !== s.id) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dragged = pack.stickers.find((x) => x.id === dragId);
              setDragId(null);
              if (dragged) void moveTo(dragged, i);
            }}
          >
            <button
              type="button"
              className={styles.editPick}
              aria-pressed={s.id === selectedId}
              aria-label={`Стикер ${s.emoji || ""}${cover?.id === s.id ? ", обложка" : ""}`}
              onClick={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
            >
              <DomNode key={s.url} create={() => renderSticker(packSticker(s), { size: 52 })} />
              <span className={styles.editEmoji}>{s.emoji}</span>
              {cover?.id === s.id ? (
                <span className={styles.coverMark} aria-hidden="true">
                  <Icon name="Star" size={12} />
                </span>
              ) : null}
            </button>
          </div>
        ))}
      </div>
      {selected ? (
        <div className={styles.editBar}>
          <label className={styles.editBarEmoji}>
            <span>Эмодзи</span>
            <input
              key={selected.id}
              className={styles.emojiInput}
              aria-label="Эмодзи стикера"
              defaultValue={selected.emoji}
              maxLength={8}
              onBlur={(e) => void setEmoji(selected, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </label>
          <button type="button" className={styles.editAction} aria-label="Раньше" disabled={selectedIndex === 0} onClick={() => void moveTo(selected, selectedIndex - 1)}>
            <Icon name="ChevronLeft" size={20} />
            <span>Раньше</span>
          </button>
          <button
            type="button"
            className={styles.editAction}
            aria-label="Позже"
            disabled={selectedIndex === pack.stickers.length - 1}
            onClick={() => void moveTo(selected, selectedIndex + 1)}
          >
            <span>Позже</span>
            <Icon name="ChevronRight" size={20} />
          </button>
          <button
            type="button"
            className={styles.editAction}
            aria-label="Сделать обложкой"
            aria-pressed={cover?.id === selected.id}
            disabled={cover?.id === selected.id}
            onClick={() => void makeCover(selected)}
          >
            <Icon name="Star" size={18} />
            <span>{cover?.id === selected.id ? "Обложка" : "Обложкой"}</span>
          </button>
          <button
            type="button"
            className={`${styles.editAction} ${styles.editActionDanger}`}
            aria-label={`Убрать «${selected.emoji || "стикер"}»`}
            onClick={() => {
              setSelectedId(null);
              void remove(selected);
            }}
          >
            <Icon name="Trash" size={18} />
            <span>Убрать</span>
          </button>
        </div>
      ) : null}
      {error ? (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.addBtn}
          disabled={uploading > 0}
          onClick={() => input.current?.click()}
        >
          {uploading > 0 ? `Загружаем… (${uploading})` : "Добавить картинку"}
        </button>
        <button
          type="button"
          className={styles.addBtn}
          disabled={uploading > 0}
          onClick={() => setPainting(true)}
        >
          Нарисовать стикер
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/gif"
        multiple
        hidden
        data-testid="sticker-pack-images"
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {painting ? (
        <PaintDialog
          title="Новый стикер"
          onClose={() => setPainting(false)}
          onDone={(file) => {
            setPainting(false);
            addFiles([file]);
          }}
        />
      ) : null}
    </div>
  );
}

type Props = {
  pack?: StickerPack | null;
  /** Встроенный пак (есть у всех, без правки и «добавить»). */
  builtin?: BuiltinStickerPack | null;
  /** Стикер встроенного пака выбран. */
  onBuiltinPick?: (s: AnimSticker) => void;
  /** Стикер, по которому открыли пак из чата: показывается крупно на своём фоне. */
  focus?: AnimSticker | null;
  /** Пака по ссылке нет (удалён или ссылка неверная). */
  missing?: boolean;
  onClose: () => void;
  onStickerPick: (s: Sticker) => void;
  onRefresh: () => void;
  /** Поверх чата: затемнение, закрытие по клику мимо и Escape. */
  overlay?: boolean;
};

export function StickerPackDetail({ overlay, ...props }: Props) {
  const { onClose } = props;
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay, onClose]);
  // Другой пак — новое состояние листа (key), без синхронизации через эффект.
  const sheetKey = props.pack?.id ?? props.builtin?.id ?? "none";
  if (!overlay) return <PackSheet key={sheetKey} {...props} />;
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.backdropBody} onClick={(e) => e.stopPropagation()}>
        <PackSheet key={sheetKey} {...props} />
      </div>
    </div>
  );
}

/** Пак, открытый из чата или панели: обложка, название, стикеры; владельцу — правка. */
function PackSheet({
  pack,
  builtin,
  onBuiltinPick,
  focus,
  missing,
  onClose,
  onStickerPick,
  onRefresh,
}: Omit<Props, "overlay">) {
  const client = useQueryClient();
  // Списки паков обновляются в фоне; лист не закрывается (onRefresh закрывает его — только после удаления).
  const reload = () =>
    void client.invalidateQueries({ queryKey: stickerPackQueries.baseKey });
  const [current, setCurrent] = useState<StickerPack | null>(pack ?? null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pack?.name ?? "");
  const [description, setDescription] = useState(pack?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => preloadStickers((pack?.stickers ?? []).map((s) => s.url)),
    [pack],
  );

  if (!current && builtin) {
    return <BuiltinPackSheet pack={builtin} focus={focus ?? null} onPick={onBuiltinPick} onClose={onClose} />;
  }

  if (!current) {
    return (
      <div
        className={styles.packSheet}
        role="dialog"
        aria-label={missing ? "Стикерпак не найден" : "Стикер"}
      >
        {focus ? <StickerStage sticker={focus} /> : null}
        {missing ? (
          <div className={styles.notFound}>
            <h2 className={styles.sheetTitle}>Стикерпак не найден</h2>
            <p className={styles.hint}>Набор удалён или ссылка неверная.</p>
          </div>
        ) : null}
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Закрыть
        </button>
      </div>
    );
  }

  const stickers = uniqueStickers(current.stickers);
  const count = stickers.length;

  const removePack = async () => {
    setConfirmRemove(false);
    setBusy(true);
    setError(null);
    try {
      await deleteStickerPack(current.id);
      onRefresh();
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось удалить пак"));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!name.trim()) return setError("Назовите пак");
    setBusy(true);
    setError(null);
    try {
      const desc = description === "" ? null : description;
      await updateStickerPack(current.id, {
        name: name.trim(),
        description: desc,
      });
      setCurrent({ ...current, name: name.trim(), description: desc });
      setEditing(false);
      reload();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
    } finally {
      setBusy(false);
    }
  };

  const confirm = confirmRemove ? (
    <div className={styles.confirm}>
      <p>Удалить стикерпак? Отправленные стикеры останутся в чатах.</p>
      <div className={styles.confirmButtons}>
        <Button variant="danger" onClick={() => void removePack()}>
          Удалить
        </Button>
        <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
          Отмена
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <div className={styles.packSheet} role="dialog" aria-label={current.name}>
      {focus && !editing ? <StickerStage sticker={focus} /> : null}
      <div className={styles.packHero}>
        {editing ? (
          <button
            type="button"
            className={styles.iconButton}
            title="Назад"
            aria-label="Назад"
            onClick={() => setEditing(false)}
          >
            <Icon name="ChevronLeft" size={18} />
          </button>
        ) : null}
        <PackCover pack={current} size={56} />
        <div className={styles.heroText}>
          <h2 className={styles.sheetTitle}>
            {editing ? "Редактирование пака" : current.name}
          </h2>
          <span className={styles.sheetMeta}>{stickerWord(count)}</span>
        </div>
      </div>
      {editing ? (
        <div className={styles.editForm}>
          <input
            className={styles.editInput}
            placeholder="Название пака"
            aria-label="Название пака"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <textarea
            className={styles.editDesc}
            placeholder="Описание пака (необязательно)"
            aria-label="Описание"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <StickerGridEditor
            pack={current}
            onChange={(next, saved) => {
              setCurrent(next);
              if (saved) reload();
            }}
          />
          {error ? (
            <p className={styles.errorText} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.sheetActions}>
            <Button variant="danger" onClick={() => setConfirmRemove(true)}>
              Удалить пак
            </Button>
            <Button disabled={busy} onClick={() => void saveEdit()}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
          {confirm}
        </div>
      ) : (
        <>
          {current.description ? (
            <p className={styles.sheetDesc}>{current.description}</p>
          ) : null}
          {count ? (
            <div className={styles.stickerGrid}>
              {stickers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={styles.stickerItem}
                  title={s.emoji || "Стикер"}
                  aria-label={s.emoji || "Стикер"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onStickerPick(s);
                    onClose();
                  }}
                >
                  <DomNode
                    key={s.url}
                    create={() => renderSticker(packSticker(s), { size: 64 })}
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.hint}>В паке пока нет стикеров.</p>
          )}
          {error ? (
            <p className={styles.errorText} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.sheetActions}>
            {current.isOwner ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setName(current.name);
                  setDescription(current.description ?? "");
                  setEditing(true);
                }}
              >
                Редактировать пак
              </Button>
            ) : null}
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              Закрыть
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Встроенный пак, открытый по стикеру из чата: крупный стикер, название и все стикеры — нажатие отправляет. */
function BuiltinPackSheet({
  pack,
  focus,
  onPick,
  onClose,
}: {
  pack: BuiltinStickerPack;
  focus: AnimSticker | null;
  onPick?: (s: AnimSticker) => void;
  onClose: () => void;
}) {
  const first = pack.stickers[0];
  return (
    <div className={styles.packSheet} role="dialog" aria-label={pack.name}>
      {focus ? <StickerStage sticker={focus} /> : null}
      <div className={styles.packHero}>
        <span className={styles.cover} style={{ width: 56, height: 56 }} aria-hidden="true">
          {first ? <DomNode create={() => renderSticker(first, { size: 50 })} /> : null}
        </span>
        <div className={styles.heroText}>
          <h2 className={styles.sheetTitle}>{pack.name}</h2>
          <span className={styles.sheetMeta}>{stickerWord(pack.stickers.length)} · встроенный набор, есть у всех</span>
        </div>
      </div>
      <div className={styles.stickerGrid}>
        {pack.stickers.map((s) => (
          <button
            key={s.id}
            type="button"
            className={styles.stickerItem}
            title={s.name}
            aria-label={`${s.emoji} ${s.name}`}
            disabled={!onPick}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick?.(s);
              onClose();
            }}
          >
            <DomNode create={() => renderSticker(s, { size: 64 })} />
          </button>
        ))}
      </div>
      <div className={styles.sheetActions}>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

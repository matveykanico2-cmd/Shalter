import { useQuery } from "@tanstack/react-query";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState,type WheelEvent as ReactWheelEvent } from "react";

import { AVATAR_PRESETS, type AvatarPreset } from "@/shared/lib/anim";
import { EMOJI_GROUPS } from "@/shared/lib/emoji-list";
import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog } from "@/shared/ui";

import { constructorStickerPacks, uploadConstructedAvatar } from "../api/avatar-constructor";
import { BACKGROUNDS, canvasToFile, isStaticImage, type Layer, layerImageUrl, posterOf, renderAvatar } from "../lib/compose";

import styles from "./avatar-constructor.module.css";

type Props = {
  onClose: () => void;
  /** Пользователь из ответа POST /api/avatars — как onChange у AvatarViewer. */
  onDone: (user: Record<string, unknown>) => void;
};

type Picker = null | "emoji" | "sticker";

let seq = 0;
const newId = () => `l${++seq}`;

/** «Собрать аватар»: фон + слои (эмодзи, стикеры, фото) в выбранном порядке, как конструктор аватара в Telegram. */
export function AvatarConstructorDialog({ onClose, onDone }: Props) {
  const [bg, setBg] = useState(BACKGROUNDS[5]!);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const packs = useQuery({ ...constructorStickerPacks(), enabled: picker === "sticker" });

  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (kind: Layer["kind"], src: string, scale = 0.5) => {
    const layer: Layer = { id: newId(), kind, src, x: 0.5, y: 0.5, scale };
    setLayers((ls) => [...ls, layer]);
    setSelected(layer.id);
    setPicker(null);
  };

  const update = (id: string, patch: Partial<Layer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const move = (id: string, dir: -1 | 1) =>
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const next = ls.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const remove = (id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (selected === id) setSelected(null);
  };

  const point = (e: ReactPointerEvent) => {
    const r = previewRef.current?.getBoundingClientRect();
    if (!r || !r.width) return { x: 0.5, y: 0.5 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onLayerDown = (e: ReactPointerEvent, l: Layer) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(l.id);
    const p = point(e);
    drag.current = { id: l.id, dx: p.x - l.x, dy: p.y - l.y };
    previewRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    update(d.id, { x: Math.min(1, Math.max(0, p.x - d.dx)), y: Math.min(1, Math.max(0, p.y - d.dy)) });
  };

  const onUp = () => {
    drag.current = null;
  };

  const onWheel = (e: ReactWheelEvent) => {
    if (!selected) return;
    const l = layers.find((x) => x.id === selected);
    if (l) update(l.id, { scale: Math.min(1.5, Math.max(0.1, l.scale * (e.deltaY < 0 ? 1.08 : 0.92))) });
  };

  const onPhoto = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    add("photo", url, 0.9);
  };

  const done = async () => {
    setBusy(true);
    setError(null);
    try {
      const canvas = await renderAvatar(bg, layers, 640);
      const res = await uploadConstructedAvatar(await canvasToFile(canvas), posterOf(canvas));
      onDone(res.user);
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить аватар"));
    } finally {
      setBusy(false);
    }
  };

  /** Готовый аватар в одно касание: градиент + персонаж; дальше можно двигать, добавлять слои или сразу «Готово». */
  const applyPreset = (p: AvatarPreset) => {
    setBg({ id: `preset-${p.id}`, css: `linear-gradient(135deg, ${p.stops[0]}, ${p.stops[1]})`, stops: p.stops });
    const layer: Layer = { id: newId(), kind: "sticker", src: p.image, x: 0.5, y: 0.53, scale: 0.9 };
    setLayers([layer]);
    setSelected(null);
    setPicker(null);
  };

  const sel = layers.find((l) => l.id === selected) ?? null;
  const ownPacks = (packs.data ?? []).filter((p) => p.isAdded || p.isOwner);

  return (
    <Dialog title="Собрать аватар" onClose={onClose} className={styles.dialog}>
      <div
        ref={previewRef}
        className={styles.preview}
        style={{ background: bg.css }}
        aria-label="Предпросмотр аватара"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={() => setSelected(null)}
        onWheel={onWheel}
      >
        {layers.map((l) => (
          <img
            key={l.id}
            src={layerImageUrl(l)}
            alt=""
            draggable={false}
            className={l.id === selected ? `${styles.layer} ${styles.layerActive}` : styles.layer}
            style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${l.scale * 100}%`, height: `${l.scale * 100}%` }}
            onPointerDown={(e) => onLayerDown(e, l)}
          />
        ))}
      </div>

      {sel ? (
        <label className={styles.scale}>
          Размер
          <input type="range" min={10} max={150} value={Math.round(sel.scale * 100)} onChange={(e) => update(sel.id, { scale: Number(e.target.value) / 100 })} />
        </label>
      ) : null}

      <p className={styles.caption}>Готовые</p>
      <div className={styles.presets}>
        {AVATAR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.preset}
            style={{ background: `linear-gradient(135deg, ${p.stops[0]}, ${p.stops[1]})` }}
            aria-label={`Готовый аватар ${p.name}`}
            title={p.name}
            onClick={() => applyPreset(p)}
          >
            <img src={p.image} alt="" loading="lazy" draggable={false} />
          </button>
        ))}
      </div>

      <p className={styles.caption}>Фон</p>
      <div className={styles.palette}>
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            className={b.id === bg.id ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch}
            style={{ background: b.css }}
            aria-label={`Фон ${b.id}`}
            aria-pressed={b.id === bg.id}
            onClick={() => setBg(b)}
          />
        ))}
      </div>

      <div className={styles.addRow}>
        <Button variant="secondary" onClick={() => setPicker(picker === "emoji" ? null : "emoji")}>
          Эмодзи
        </Button>
        <Button variant="secondary" onClick={() => setPicker(picker === "sticker" ? null : "sticker")}>
          Стикер
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          Фото
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            onPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {picker === "emoji" ? (
        <div className={styles.grid}>
          {EMOJI_GROUPS.flatMap((g) => g.emojis)
            .slice(0, 400)
            .map((em) => (
              <button key={em} type="button" className={styles.cell} aria-label={em} onClick={() => add("emoji", em)}>
                <img src={layerImageUrl({ id: "", kind: "emoji", src: em, x: 0, y: 0, scale: 0 })} alt={em} loading="lazy" />
              </button>
            ))}
        </div>
      ) : null}

      {picker === "sticker" ? (
        <div className={styles.grid}>
          {packs.isPending ? <p className={styles.caption}>Загрузка…</p> : null}
          {!packs.isPending && ownPacks.length === 0 ? <p className={styles.caption}>Нет стикерпаков</p> : null}
          {ownPacks.flatMap((p) =>
            p.stickers
              .filter((s) => isStaticImage(s.url))
              .map((s) => (
                <button key={s.id} type="button" className={styles.cell} aria-label={`Стикер ${s.emoji}`} onClick={() => add("sticker", s.url)}>
                  <img src={s.url} alt={s.emoji} loading="lazy" />
                </button>
              ))
          )}
        </div>
      ) : null}

      {layers.length ? (
        <>
          <p className={styles.caption}>Слои (сверху — передний план)</p>
          <ul className={styles.layers}>
            {layers
              .map((l, i) => ({ l, i }))
              .reverse()
              .map(({ l, i }) => (
                <li key={l.id} className={l.id === selected ? `${styles.layerRow} ${styles.layerRowActive}` : styles.layerRow}>
                  <button type="button" className={styles.layerPick} onClick={() => setSelected(l.id)}>
                    <img src={layerImageUrl(l)} alt="" />
                    <span>{l.kind === "emoji" ? "Эмодзи" : l.kind === "sticker" ? "Стикер" : "Фото"}</span>
                  </button>
                  <button type="button" aria-label="Выше" disabled={i === layers.length - 1} onClick={() => move(l.id, 1)}>
                    ↑
                  </button>
                  <button type="button" aria-label="Ниже" disabled={i === 0} onClick={() => move(l.id, -1)}>
                    ↓
                  </button>
                  <button type="button" aria-label="Удалить слой" onClick={() => remove(l.id)}>
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        </>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={() => void done()} disabled={busy}>
          {busy ? "Сохраняем…" : "Готово"}
        </Button>
      </div>
    </Dialog>
  );
}

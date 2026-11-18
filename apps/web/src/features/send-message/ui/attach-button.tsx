import { type ChangeEvent, useRef, useState } from "react";

import { Icon, type IconName, Menu, type MenuItem } from "@/shared/ui";

import { hasRecentPhotos } from "../lib/recent-photos";

import styles from "./composer.module.css";
import { RecentPhotosStrip } from "./recent-photos-strip";

type Props = {
  onFiles: (files: File[]) => void;
  onPoll: () => void;
  onChecklist: () => void;
  /** «Статья (Premium)»; нет — пункта нет (пост канала статьёй не публикуется). */
  onArticle?: () => void;
  onDice: (emoji: string) => void;
  /** Каталог игр — карточка выбранной игры уходит в чат. */
  onGames: () => void;
  onLocation: (live: boolean) => void;
  onContact: () => void;
  onHugo: () => void;
  /** Мем и рисунок — картинкой сразу в чат. */
  onMeme: () => void;
  onPaint: () => void;
  /** Нет — «Отправить позже» не показываем (ответ в ветке). */
  onSchedule?: () => void;
};

/** Эмодзи-игры (число выпадает на сервере); над ними — каталог HTML5-игр. */
const DICE: [string, string][] = [
  ["🎲", "Кубик"],
  ["🎯", "Дартс"],
  ["🏀", "Баскетбол"],
  ["⚽", "Футбол"],
  ["🎳", "Боулинг"],
  ["🎰", "Слот-машина"],
];

/** Ширина, на которой меню — шторка снизу (как SHEET_QUERY в shared/ui/menu). */
const PHONE_QUERY = "(max-width: 560px)";

type TileAction = "gallery" | "camera" | "video" | "file" | "audio" | "location" | "live-location" | "poll" | "checklist" | "contact" | "meme" | "paint" | "games" | "hugo" | "schedule";
type Tile = { icon: IconName; label: string; color: string; action: TileAction };

/** Скрепка — как меню вложений в composer.js: фото и видео, камера, файл, аудио, мем, рисунок, опрос, чек-лист, кубики, геолокация, контакт. */
export function AttachButton({ onFiles, onPoll, onChecklist, onArticle, onDice, onGames, onLocation, onContact, onHugo, onMeme, onPaint, onSchedule }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [phone, setPhone] = useState(false);
  const [diceAt, setDiceAt] = useState<{ x: number; y: number } | null>(null);
  const media = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const any = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLInputElement>(null);

  const take = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length) onFiles(files);
  };
  // На телефоне главное — круглыми кнопками в шапке шторки (tiles ниже), в списке остальное.
  const items: MenuItem[] = [
    ...(phone ? [] : [{ icon: "Image" as const, iconColor: "#3b82f6", label: "Фото или видео", onClick: () => media.current?.click() }]),
    ...(phone ? [] : [{ icon: "Camera" as const, iconColor: "#8b5cf6", label: "Снять фото", onClick: () => photo.current?.click() }]),
    { icon: "Video", iconColor: "#6366f1", label: "Снять видео", onClick: () => video.current?.click() },
    ...(phone ? [] : [{ icon: "File" as const, iconColor: "#0ea5e9", label: "Файл", onClick: () => any.current?.click() }]),
    // accept="audio/*" открывает на телефоне музыку, а не галерею; трек уходит файлом с плеером.
    ...(phone ? [] : [{ icon: "Mic" as const, iconColor: "#ec4899", label: "Аудио", onClick: () => audio.current?.click() }]),
    { icon: "Zap", iconColor: "#eab308", label: "Мем", onClick: onMeme },
    { icon: "Edit", iconColor: "#f43f5e", label: "Рисунок", onClick: onPaint },
    ...(phone ? [] : [{ icon: "BarChart" as const, label: "Опрос", onClick: onPoll }]),
    ...(phone ? [] : [{ icon: "CheckCheck" as const, label: "Чек-лист", onClick: onChecklist }]),
    ...(onArticle ? [{ icon: "Star" as const, label: "Статья (Premium)", onClick: onArticle }] : []),
    // Меню закрывается раньше, чем откроется следующее, — второе ставим в ту же точку.
    { icon: "Smile", label: "Кубик и игры", onClick: () => setTimeout(() => setDiceAt(at), 0) },
    ...(phone ? [] : [{ icon: "MapPin" as const, label: "Геолокация", onClick: () => onLocation(false) }]),
    { icon: "MapPin", label: "Живая геолокация (15 мин)", onClick: () => onLocation(true) },
    ...(phone ? [] : [{ icon: "Users" as const, label: "Контакт", onClick: onContact }]),
    { icon: "Check", label: "Проверить текст (Hugo)", onClick: onHugo },
    ...(onSchedule ? [{ icon: "Clock" as const, label: "Отправить позже", onClick: onSchedule }] : []),
  ];

  // Телефон — шторка как в Telegram: сверху круглые цветные кнопки главного, ниже — остальное списком.
  const tiles: Tile[] = [
    { icon: "Image", label: "Галерея", color: "#3b82f6", action: "gallery" },
    { icon: "Camera", label: "Камера", color: "#8b5cf6", action: "camera" },
    { icon: "Video", label: "Видео", color: "#6366f1", action: "video" },
    { icon: "File", label: "Файл", color: "#0ea5e9", action: "file" },
    { icon: "Mic", label: "Музыка", color: "#ec4899", action: "audio" },
    { icon: "MapPin", label: "Геопозиция", color: "#22c55e", action: "location" },
    { icon: "MapPin", label: "Живая гео", color: "#16a34a", action: "live-location" },
    { icon: "BarChart", label: "Опрос", color: "#f59e0b", action: "poll" },
    { icon: "CheckCheck", label: "Чек-лист", color: "#14b8a6", action: "checklist" },
    { icon: "Users", label: "Контакт", color: "#f97316", action: "contact" },
    { icon: "Zap", label: "Мем", color: "#eab308", action: "meme" },
    { icon: "Edit", label: "Рисунок", color: "#f43f5e", action: "paint" },
    { icon: "Smile", label: "Игры", color: "#a855f7", action: "games" },
    { icon: "Check", label: "Проверка", color: "#64748b", action: "hugo" },
    ...(onSchedule ? [{ icon: "Clock" as const, label: "Позже", color: "#475569", action: "schedule" as const }] : []),
  ];
  const runTile = (action: TileAction) => {
    if (action === "gallery") media.current?.click();
    else if (action === "camera") photo.current?.click();
    else if (action === "video") video.current?.click();
    else if (action === "file") any.current?.click();
    else if (action === "audio") audio.current?.click();
    else if (action === "location") onLocation(false);
    else if (action === "live-location") onLocation(true);
    else if (action === "poll") onPoll();
    else if (action === "checklist") onChecklist();
    else if (action === "contact") onContact();
    else if (action === "meme") onMeme();
    else if (action === "paint") onPaint();
    else if (action === "games") onGames();
    else if (action === "hugo") onHugo();
    else if (action === "schedule") onSchedule?.();
  };
  const header = phone ? (
    <>
      {hasRecentPhotos() ? (
        <RecentPhotosStrip
          onSend={(files) => {
            setAt(null);
            if (files.length) onFiles(files);
          }}
        />
      ) : null}
      <div className={styles.attachTiles}>
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            className={styles.attachTile}
            onClick={() => {
              setAt(null);
              runTile(tile.action);
            }}
          >
            <span className={styles.attachTileIcon} style={{ background: tile.color }}>
              <Icon name={tile.icon} size={24} />
            </span>
            <span>{tile.label}</span>
          </button>
        ))}
      </div>
    </>
  ) : undefined;

  return (
    <>
      <button
        type="button"
        className={styles.attach}
        title="Вложение"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPhone(typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches);
          setAt({ x: r.left, y: r.top - 8 });
        }}
      >
        <Icon name="Paperclip" size={22} />
      </button>
      <input ref={media} type="file" accept="image/*,video/*" multiple hidden onChange={take} data-testid="attach-media" />
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={take} />
      <input ref={video} type="file" accept="video/*" capture="environment" hidden onChange={take} />
      <input ref={any} type="file" multiple hidden onChange={take} data-testid="attach-file" />
      <input ref={audio} type="file" accept="audio/*" multiple hidden onChange={take} />
      {at ? <Menu at={at} label="Вложение" header={header} items={items} closeOnBlur={!hasRecentPhotos()} onClose={() => setAt(null)} /> : null}
      {diceAt ? (
        <Menu at={diceAt} label="Кубик и игры" items={[{ label: "🎮  Игры — 2048, Змейка, свои…", onClick: onGames }, ...DICE.map(([emoji, label]) => ({ label: `${emoji}  ${label}`, onClick: () => onDice(emoji) }))]} onClose={() => setDiceAt(null)} />
      ) : null}
    </>
  );
}

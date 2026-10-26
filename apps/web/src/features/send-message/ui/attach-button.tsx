import { type ChangeEvent, useRef, useState } from "react";

import { Icon, Menu, type MenuItem } from "@/shared/ui";

import styles from "./composer.module.css";

type Props = {
  onFiles: (files: File[]) => void;
  onPoll: () => void;
  onChecklist: () => void;
  onDice: (emoji: string) => void;
  onLocation: (live: boolean) => void;
  onContact: () => void;
  onHugo: () => void;
  /** Нет — «Отправить позже» не показываем (ответ в ветке). */
  onSchedule?: () => void;
};

/** Эмодзи-игры (число выпадает на сервере). Каталог игр переедет вместе с экраном игр. */
const DICE: [string, string][] = [
  ["🎲", "Кубик"],
  ["🎯", "Дартс"],
  ["🏀", "Баскетбол"],
  ["⚽", "Футбол"],
  ["🎳", "Боулинг"],
  ["🎰", "Слот-машина"],
];

/** Скрепка — как меню вложений в composer.js: фото и видео, камера, файл, аудио, опрос, чек-лист, кубики, геолокация, контакт. */
export function AttachButton({ onFiles, onPoll, onChecklist, onDice, onLocation, onContact, onHugo, onSchedule }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
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
  const items: MenuItem[] = [
    { icon: "Image", label: "Фото или видео", onClick: () => media.current?.click() },
    { icon: "Camera", label: "Снять фото", onClick: () => photo.current?.click() },
    { icon: "Video", label: "Снять видео", onClick: () => video.current?.click() },
    { icon: "File", label: "Файл", onClick: () => any.current?.click() },
    // accept="audio/*" открывает на телефоне музыку, а не галерею; трек уходит файлом с плеером.
    { icon: "Mic", label: "Аудио", onClick: () => audio.current?.click() },
    { icon: "BarChart", label: "Опрос", onClick: onPoll },
    { icon: "CheckCheck", label: "Чек-лист", onClick: onChecklist },
    // Меню закрывается раньше, чем откроется следующее, — второе ставим в ту же точку.
    { icon: "Smile", label: "Кубик и игры", onClick: () => setTimeout(() => setDiceAt(at), 0) },
    { icon: "MapPin", label: "Геолокация", onClick: () => onLocation(false) },
    { icon: "MapPin", label: "Живая геолокация (15 мин)", onClick: () => onLocation(true) },
    { icon: "Users", label: "Контакт", onClick: onContact },
    { icon: "Check", label: "Проверить текст (Hugo)", onClick: onHugo },
    ...(onSchedule ? [{ icon: "Clock" as const, label: "Отправить позже", onClick: onSchedule }] : []),
  ];

  return (
    <>
      <button
        type="button"
        className={styles.attach}
        title="Прикрепить"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
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
      {at ? <Menu at={at} label="Прикрепить" items={items} onClose={() => setAt(null)} /> : null}
      {diceAt ? (
        <Menu at={diceAt} label="Кубик и игры" items={DICE.map(([emoji, label]) => ({ label: `${emoji}  ${label}`, onClick: () => onDice(emoji) }))} onClose={() => setDiceAt(null)} />
      ) : null}
    </>
  );
}

import { type ChangeEvent, useRef, useState } from "react";

import { Icon, Menu, type MenuItem } from "@/shared/ui";

import styles from "./composer.module.css";

type Props = { onFiles: (files: File[]) => void };

/** Скрепка — как меню вложений в composer.js: фото и видео, камера, файл, аудио. */
export function AttachButton({ onFiles }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
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
    </>
  );
}

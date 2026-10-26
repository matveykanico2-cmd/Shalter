import { useRef } from "react";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { Avatar, Icon, toast } from "@/shared/ui";

import styles from "./community-editor.module.css";

/** Фото сообщества с выбором файла — twAvatarEdit в twTab.js. */
export function AvatarEdit({ name, image, onChange }: { name: string; image: string | null; onChange: (image: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange(await fileToImageDataUrl(file, 512));
    } catch (err) {
      toast(errorText(err, "Не удалось прочитать изображение"), { error: true });
    }
  };
  return (
    <>
      <button type="button" className={styles.avatarEdit} title="Выбрать фото" onClick={() => input.current?.click()}>
        <Avatar size={96} name={name || "?"} image={image} />
        <span className={styles.avatarIcon}>
          <Icon name="Camera" size={30} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Фото"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}

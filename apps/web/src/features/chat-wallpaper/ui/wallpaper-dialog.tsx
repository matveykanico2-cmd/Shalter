import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { chatCache, type ChatSummary } from "@/entities/chat";
import { settingsQueries, useSettings } from "@/entities/settings";

import { errorText } from "@/shared/lib/error-text";
import { fileToImageDataUrl } from "@/shared/lib/image";
import { asWallpaper, Button, ChoiceDialog, Dialog, Icon, toast, type Wallpaper, WALLPAPER_GROUPS, wallpaperProps } from "@/shared/ui";

import { setMyChatWallpaper, setSharedChatWallpaper } from "../api/chat-wallpaper";

import styles from "./wallpaper-dialog.module.css";

const LABELS = new Map<string, string>(WALLPAPER_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label])));

/** «Фон чата» — как public/js/components/wallpaperDialog.js и handleChooseWallpaper (chatView.js). */
export function WallpaperDialog({ chat, onClose }: { chat: ChatSummary; onClose: () => void }) {
  const client = useQueryClient();
  const { data: settings } = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Выбранное ждёт ответа «только у меня / у всех»; undefined — ещё ничего не выбрали.
  const [picked, setPicked] = useState<Wallpaper | null | undefined>(undefined);
  // Отмечен фон этого чата (свой или общий), не обои из настроек.
  const current = asWallpaper(settings?.chatWallpapers?.[chat.id]) ?? asWallpaper(chat.wallpaper);

  const save = async (wallpaper: Wallpaper | null, forEveryone: boolean) => {
    try {
      if (forEveryone) {
        const label = wallpaper ? (wallpaper.id === "custom" ? "своё фото" : (LABELS.get(wallpaper.id) ?? null)) : null;
        const { chat: updated } = await setSharedChatWallpaper(chat.id, wallpaper, label);
        chatCache.patchChat(client, chat.id, { wallpaper: updated.wallpaper });
      } else {
        const { settings: updated } = await setMyChatWallpaper(chat.id, wallpaper);
        client.setQueryData(settingsQueries.current().queryKey, updated);
      }
    } catch (err) {
      toast(errorText(err, "Не удалось поменять фон"), { error: true });
    }
  };

  const pickCustom = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPicked({ id: "custom", image: await fileToImageDataUrl(file, 1280) });
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить фото"));
    }
  };

  if (picked !== undefined) {
    return (
      <ChoiceDialog
        title={picked ? "Поменять фон" : "Сбросить фон"}
        choices={[
          { label: "Только у меня", onClick: () => void save(picked, false) },
          { label: "У всех участников", onClick: () => void save(picked, true) },
        ]}
        onClose={onClose}
      />
    );
  }

  return (
    <Dialog title="Фон чата" onClose={onClose} className={styles.dialog}>
      <div className={styles.body}>
        {WALLPAPER_GROUPS.map((group) => (
          <section key={group.label}>
            <p className={styles.groupLabel}>{group.label}</p>
            <div className={styles.grid}>
              {group.items.map((w) => {
                const custom = w.id === "custom";
                const ownPhoto = custom && current?.id === "custom" && current.image ? current : null;
                const fill = wallpaperProps(custom ? (ownPhoto ?? { id: "custom" }) : { id: w.id });
                return (
                  <button
                    key={w.id}
                    type="button"
                    title={w.label}
                    aria-pressed={current?.id === w.id}
                    className={current?.id === w.id ? `${styles.swatch} ${styles.active}` : styles.swatch}
                    onClick={() => (custom ? fileInput.current?.click() : setPicked({ id: w.id }))}
                  >
                    <span className={`${styles.fill} ${fill.className}`} style={fill.style}>
                      {custom && !ownPhoto ? <Icon name="Plus" size={18} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
      <div className={styles.footer}>
        <Button variant="link" onClick={() => setPicked(null)}>
          Сбросить
        </Button>
        <Button variant="link" onClick={onClose}>
          Отмена
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        aria-label="Своё фото"
        onChange={(e) => void pickCustom(e.target.files?.[0])}
      />
    </Dialog>
  );
}

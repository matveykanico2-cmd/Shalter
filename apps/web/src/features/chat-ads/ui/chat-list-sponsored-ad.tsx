import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import { internalAdRoute } from "@/shared/lib/ad-link";
import { Icon, openExternally, toast } from "@/shared/ui";

import { clickAd, type ServedAd } from "../api/chat-ads";

import styles from "./chat-list-sponsored-ad.module.css";

export function ChatListSponsoredAd({ ad }: { ad: ServedAd }) {
  const navigate = useNavigate();
  const key = `shalter.ad.hidden.${ad.id}`;
  const [hidden, setHidden] = useState(() => localStorage.getItem(key) === "1");
  const [imageFailed, setImageFailed] = useState(false);
  const clickInFlight = useRef(false);
  const open = async () => {
    if (clickInFlight.current) return;
    clickInFlight.current = true;
    await clickAd(ad.id).catch(() => {});
    clickInFlight.current = false;
    if (!ad.url) return;
    const internal = internalAdRoute(ad.url);
    if (internal) void navigate(internal);
    else if (/^https?:\/\//i.test(ad.url)) openExternally(ad.url);
    else toast("Ссылка рекламы недоступна", { error: true });
  };

  if (hidden) return null;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.ad} aria-label={`Реклама: ${ad.title || ad.text}`} onClick={() => void open()}>
        <span className={styles.picture}>
          {ad.imageUrl && !imageFailed ? <img src={ad.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : <Icon name="Megaphone" size={24} />}
        </span>
        <span className={styles.body}>
          <span className={styles.head}>
            <span className={styles.label}>Реклама</span>
            <span className={styles.action}>{ad.url ? "Открыть" : "Подробнее"}</span>
          </span>
          <span className={styles.title}>{ad.title || "Спонсорское сообщение"}</span>
          <span className={styles.text}>{ad.text}</span>
        </span>
      </button>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Скрыть рекламу"
        title="Скрыть эту рекламу"
        onClick={() => {
          localStorage.setItem(key, "1");
          setHidden(true);
        }}
      >
        <Icon name="X" size={13} />
      </button>
    </div>
  );
}

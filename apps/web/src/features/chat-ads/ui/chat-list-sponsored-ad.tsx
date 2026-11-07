import { useNavigate } from "react-router";

import { Icon } from "@/shared/ui";

import { clickAd, type ServedAd } from "../api/chat-ads";

import styles from "./chat-list-sponsored-ad.module.css";

export function ChatListSponsoredAd({ ad }: { ad: ServedAd }) {
  const navigate = useNavigate();
  const open = async () => {
    await clickAd(ad.id).catch(() => {});
    if (!ad.url) return;
    if (ad.url.startsWith("/")) void navigate(ad.url);
    else if (/^https?:\/\//i.test(ad.url)) window.open(ad.url, "_blank", "noopener,noreferrer");
  };

  return (
    <button type="button" className={styles.ad} aria-label={`Реклама: ${ad.title || ad.text}`} onClick={() => void open()}>
      <span className={styles.picture}>
        {ad.imageUrl ? <img src={ad.imageUrl} alt="" loading="lazy" /> : <Icon name="Megaphone" size={24} />}
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
  );
}

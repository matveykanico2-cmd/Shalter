import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Icon, Menu, toast } from "@/shared/ui";

import { chatAdsQueries, clickAd, type ServedAd } from "../api/chat-ads";

import styles from "./sponsored-message.module.css";

const ABOUT = "Рекламу в каналах показывает Shalter: так авторы зарабатывают, а мессенджер остаётся бесплатным. Объявления не используют ваши личные данные.";

/** Рекламное сообщение в конце ленты канала — SponsoredMessage в public/js/views/chatView.js (tweb is-sponsored). */
export function SponsoredMessage({ chatId, premium }: { chatId: string; premium: boolean }) {
  const ad = useQuery(chatAdsQueries.chat(chatId)).data?.ad ?? null;
  const [hidden, setHidden] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const navigate = useNavigate();
  if (!ad || hidden) return null;

  const open = async (a: ServedAd) => {
    await clickAd(a.id).catch(() => {});
    if (!a.url) return;
    if (a.url.startsWith("/")) void navigate(a.url);
    else if (/^https?:\/\//i.test(a.url)) window.open(a.url, "_blank", "noreferrer");
  };

  return (
    <div className={styles.row}>
      <div className={styles.bubble} aria-label="Реклама">
        <div className={styles.head}>
          <span className={styles.label}>Реклама</span>
          <button
            type="button"
            className={styles.more}
            title="Ещё"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenuAt({ x: r.left, y: r.bottom + 4 });
            }}
          >
            <Icon name="More" size={18} />
          </button>
        </div>
        {ad.imageUrl ? <img className={styles.image} src={ad.imageUrl} alt="" loading="lazy" /> : null}
        <p className={styles.title}>{ad.title || "Реклама"}</p>
        {ad.text ? <p className={styles.text}>{ad.text}</p> : null}
        <button type="button" className={styles.open} onClick={() => void open(ad)}>
          {ad.url ? "Открыть" : "Подробнее"}
        </button>
      </div>
      {menuAt ? (
        <Menu
          at={menuAt}
          items={[
            { icon: "Info", label: "Что это за реклама?", onClick: () => toast(ABOUT, { durationMs: 8000 }) },
            {
              icon: "X",
              label: "Скрыть рекламу",
              // Скрыть рекламу можно с Premium — без него ведём к его покупке.
              onClick: () => (premium ? setHidden(true) : void navigate("/settings/premium")),
            },
          ]}
          onClose={() => setMenuAt(null)}
        />
      ) : null}
    </div>
  );
}

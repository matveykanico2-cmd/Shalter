import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type CatalogGift, GiftGrid, giftQueries, GiftTile } from "@/entities/gift";

import { errorText } from "@/shared/lib/error-text";
import { Icon, toast } from "@/shared/ui";

import styles from "./gift-shop.module.css";

const fmt = (n: number) => Number(n ?? 0).toLocaleString("ru-RU");

type Props = { title?: string; searchPlaceholder?: string; onPick: (gift: CatalogGift) => void; onClose: () => void };

/**
 * Выбор подарка из витрины сеткой (openGiftPickerDialog в giftPickerDialog.js): та же плитка,
 * что в магазине, с картинкой и подписью — «Выдать подарок (админ)».
 */
export function GiftPickerDialog({ title = "Выдать подарок", searchPlaceholder = "Поиск подарка", onPick, onClose }: Props) {
  const shop = useQuery(giftQueries.shop());
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    search.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const gifts = shop.data?.gifts ?? [];
  const list = q ? gifts.filter((g) => `${g.name ?? ""} ${g.emoji ?? ""}`.toLowerCase().includes(q)) : gifts;

  return createPortal(
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.popup} role="dialog" aria-modal="true" aria-label={title}>
        <div className={`${styles.header} ${styles.solid}`}>
          <button type="button" className={styles.iconButton} aria-label="Закрыть" title="Закрыть" onClick={onClose}>
            <Icon name="X" size={22} />
          </button>
          <div className={styles.headerTitle}>{title}</div>
        </div>
        <div className={styles.inputWrap}>
          <input ref={search} className={styles.input} type="search" placeholder={searchPlaceholder} aria-label={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query ? (
            <button
              type="button"
              className={styles.clear}
              aria-label="Очистить"
              onClick={() => {
                setQuery("");
                search.current?.focus();
              }}
            >
              <Icon name="X" size={16} />
            </button>
          ) : null}
        </div>
        <div className={`${styles.scroll} ${styles.gridWrap}`}>
          {shop.isError ? (
            <p className={styles.empty}>{errorText(shop.error, "Не удалось загрузить подарки")}</p>
          ) : !shop.data ? (
            <p className={styles.empty}>Загружаем…</p>
          ) : !list.length ? (
            <p className={styles.empty}>Ничего не найдено</p>
          ) : (
            <GiftGrid>
              {list.map((g) => {
                const soldOut = g.supply != null && (g.remaining ?? 0) <= 0;
                const badge = soldOut ? { text: "распродан", tone: "soldOut" as const } : g.supply ? { text: "лимит" } : g.exclusive ? { text: "редкий", tone: "rare" as const } : null;
                return (
                  <GiftTile
                    key={g.id}
                    gift={g}
                    label={g.name}
                    name={g.name}
                    title={soldOut ? `${g.name} — распродан` : `${g.name} — ⭐ ${fmt(g.priceStars)}`}
                    badge={badge}
                    soldOut={soldOut}
                    price={g.priceStars}
                    onClick={() => {
                      if (soldOut) return toast(`«${g.name}» распродан`);
                      onClose();
                      onPick(g);
                    }}
                  />
                );
              })}
            </GiftGrid>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

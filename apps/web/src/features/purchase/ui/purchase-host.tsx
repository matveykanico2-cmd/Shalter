import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { closeDonationOrder, closeStarsDialog, type DonationOrder, usePurchaseWindows } from "@/entities/stars";

import { Button, Dialog, Icon } from "@/shared/ui";

import { openSupportChat } from "../api/purchase";

import styles from "./purchase.module.css";
import { StarsPanel } from "./stars-panel";

/** Окна покупки, открытые откуда угодно (openStarsDialog, showDonationOrder), — один раз в приложении. */
export function PurchaseHost() {
  const { stars, donation } = usePurchaseWindows();
  return (
    <>
      {stars ? <StarsDialog onClose={closeStarsDialog} /> : null}
      {donation ? <DonationDialog order={donation} onClose={closeDonationOrder} /> : null}
    </>
  );
}

/** Всплывающее окно «Звёзды» (openStarsDialog): то же, что раздел в настройках, с крестиком. */
function StarsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className={styles.overlay} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.popup} role="dialog" aria-modal="true" aria-label="Звёзды">
        <button type="button" className={styles.popupClose} title="Закрыть" aria-label="Закрыть" onClick={onClose}>
          <Icon name="X" size={22} />
        </button>
        <StarsPanel onNavigate={onClose} />
      </div>
    </div>,
    document.body
  );
}

const PROVIDER_LABEL: Record<string, string> = { donationalerts: "DonationAlerts", donatepay: "DonatePay" };

/** Оплата через донат-сервис (donationDialog.js): код заказа для комментария и ссылка на страницу доната. */
function DonationDialog({ order, onClose }: { order: DonationOrder; onClose: () => void }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.code);
      setCopied("Код скопирован ✓");
    } catch {
      setCopied("Не удалось скопировать — выделите вручную");
    }
  };
  const support = async () => {
    try {
      const { chatId } = await openSupportChat();
      onClose();
      void navigate(`/chat/${chatId}`);
    } catch {
      // Поддержка недоступна — окно остаётся, код на месте.
    }
  };
  return (
    <Dialog title={`Оплата через ${PROVIDER_LABEL[order.provider] ?? "донаты"}`} onClose={onClose}>
      <p className={styles.hint}>
        Переведите {order.amountRub}₽ по ссылке ниже и обязательно укажите в сообщении к донату этот код — иначе оплата не свяжется с вашей покупкой:
      </p>
      <div className={styles.codeRow}>
        <span className={styles.code}>{order.code}</span>
        <button type="button" className={styles.iconButton} title="Скопировать код" aria-label="Скопировать код" onClick={() => void copy()}>
          <Icon name="Copy" size={16} />
        </button>
      </div>
      {copied ? <p className={styles.hint}>{copied}</p> : null}
      <a className={styles.linkButton} href={order.donationUrl} target="_blank" rel="noreferrer">
        Перейти к оплате
      </a>
      <p className={styles.hint}>Как только донат придёт — покупка активируется автоматически, обычно в течение минуты.</p>
      <button type="button" className={styles.textButton} onClick={() => void support()}>
        Оплата не прошла? Написать в поддержку
      </button>
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Dialog>
  );
}

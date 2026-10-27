import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router";

import { handlePurchaseResponse, StarIcon, starsQueries } from "@/entities/stars";

import { errorText } from "@/shared/lib/error-text";
import { Button, EmojiText, Icon, type IconName, SettingsSection, TextField } from "@/shared/ui";

import { requestStars, searchPeople, setMessagePrice, transferStars } from "../api/purchase";

import styles from "./purchase.module.css";

type Person = { id: string; name: string; username?: string | null };

// Стопка звёзд у набора — чем больше набор, тем больше звёзд (StarsStackedStars в tweb).
function StackedStars({ amount }: { amount: number }) {
  const count = amount >= 2500 ? 6 : amount >= 1000 ? 5 : amount >= 500 ? 4 : amount >= 250 ? 3 : amount >= 50 ? 2 : 1;
  return (
    <span className={styles.stacked}>
      {Array.from({ length: count }, (_, i) => (
        <StarIcon key={i} size={20} stroke={i !== count - 1} className={styles.stackedItem} />
      ))}
    </span>
  );
}

function CostRow({ icon, color, title, subtitle }: { icon: IconName; color: string; title: string; subtitle: string }) {
  return (
    <div className={styles.costRow}>
      <span className={styles.costIcon} style={{ background: color }}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.costBody}>
        <span>{title}</span> <span className={styles.muted}>{subtitle}</span>
      </span>
    </div>
  );
}

/**
 * «Звёзды» в духе popup-stars из tweb (StarsPanel в public/js/components/starsDialog.js): баланс,
 * наборы, перевод, на что тратятся, плата за сообщения мне. Одно и то же на странице и в окне.
 */
export function StarsPanel({ onNavigate }: { onNavigate?: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const info = useQuery({ ...starsQueries.info(), refetchOnMount: "always" });
  const data = info.data;
  const priceLabelId = useId();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAllPacks, setShowAllPacks] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [transferTo, setTransferTo] = useState<Person | null>(null);
  // Подсказки привязаны к запросу: устаревшие (поле уже другое) не показываются.
  const [results, setResults] = useState<{ q: string; users: Person[] }>({ q: "", users: [] });
  const [amount, setAmount] = useState("");

  // Получатель — из поиска по имени или нику, с паузой после ввода.
  useEffect(() => {
    const q = to.trim();
    if (transferTo || q.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      searchPeople(q).then(
        (users) => live && setResults({ q, users: users.filter((u) => u.id !== data?.userId).slice(0, 4) }),
        () => live && setResults({ q, users: [] })
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [to, transferTo, data?.userId]);

  const found = !transferTo && results.q === to.trim() ? results.users : [];

  const setBalance = (balance: number) => client.setQueryData(starsQueries.info().queryKey, (d) => (d ? { ...d, balance } : d));
  const begin = () => {
    setError(null);
    setNotice(null);
  };

  const buy = async (pack: { id: string; stars: number }) => {
    if (busy) return;
    begin();
    setBusy(true);
    try {
      const res = await requestStars(pack.id);
      if (res.granted) {
        setNotice(`Начислено ${pack.stars} ⭐`);
        await client.invalidateQueries({ queryKey: starsQueries.info().queryKey });
      } else
        handlePurchaseResponse(res, (chatId) => {
          onNavigate?.();
          void navigate(`/chat/${chatId}`);
        });
    } catch (err) {
      setError(errorText(err, "Не удалось оформить покупку"));
    }
    setBusy(false);
  };

  const sendTransfer = async () => {
    if (busy) return;
    begin();
    const value = Math.floor(Number(amount));
    let target = transferTo;
    if (!target) {
      const q = to.trim().replace(/^@/, "").toLowerCase();
      target = found.find((u) => (u.username ?? "").toLowerCase() === q) ?? (found.length === 1 ? found[0]! : null);
    }
    if (!target) return setError(found.length ? "Выберите получателя из списка" : "Никого не нашлось по этому имени или @нику");
    if (!Number.isFinite(value) || value <= 0) return setError("Укажите сумму больше нуля");
    setBusy(true);
    try {
      const res = await transferStars(target.id, value);
      setNotice(`Отправлено ${res.amount} ⭐ — ${target.name}`);
      setBalance(res.balance);
      setTransferTo(null);
      setTo("");
      setAmount("");
    } catch (err) {
      setError(errorText(err, "Не удалось перевести"));
    }
    setBusy(false);
  };

  const savePrice = async () => {
    begin();
    try {
      const { messagePriceStars } = await setMessagePrice(Number(price ?? data?.messagePriceStars ?? 0));
      client.setQueryData(starsQueries.info().queryKey, (d) => (d ? { ...d, messagePriceStars } : d));
      setPrice(null);
      setNotice(messagePriceStars > 0 ? `Незнакомцы платят ${messagePriceStars} ⭐ за сообщение` : "Писать вам могут все бесплатно");
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить"));
    }
  };

  const intro = (
    <div className={styles.intro}>
      <img className={styles.introImage} src="/img/tweb/stars.png" alt="" width={194} height={110} />
      <h2 className={styles.mediaTitle}>Звёзды</h2>
      <p className={styles.mediaSubtitle}>Платите за сообщения незнакомцам, поднимайте свои сообщения и дарите подарки.</p>
    </div>
  );
  if (!data) {
    return (
      <div className={styles.stars}>
        {intro}
        <p className={info.error ? styles.error : styles.hintCenter}>{info.error ? errorText(info.error, "Не удалось загрузить баланс") : "Загружаем…"}</p>
      </div>
    );
  }

  const packs = data.packs;
  const visiblePacks = showAllPacks ? packs : packs.slice(0, 6);
  const lonely = visiblePacks.length % 2 === 1;

  return (
    <div className={styles.stars}>
      {intro}
      <div className={styles.balance}>
        <span className={styles.balanceTitle}>Баланс</span>
        <span className={styles.balanceValue}>
          <StarIcon size={22} />
          {data.balance}
        </span>
      </div>
      {notice ? (
        <p className={styles.notice}>
          <EmojiText text={`✅ ${notice}`} />
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <SettingsSection title="Купить звёзды" caption="Оплата переводом администрации — заявка создастся автоматически, звёзды придут после подтверждения.">
        <div className={styles.options}>
          {visiblePacks.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={lonely && i === visiblePacks.length - 1 ? `${styles.option} ${styles.optionFull}` : styles.option}
              disabled={busy}
              onClick={() => void buy(p)}
            >
              <span className={styles.optionTitle}>
                {`+${p.stars}`}
                <StackedStars amount={p.stars} />
              </span>{" "}
              <span className={styles.optionSubtitle}>{p.priceRub} ₽</span>
            </button>
          ))}
        </div>
        {packs.length > 6 && !showAllPacks ? (
          <button type="button" className={styles.more} onClick={() => setShowAllPacks(true)}>
            Больше вариантов
            <Icon name="ChevronRight" size={18} />
          </button>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Перевести звёзды" caption="Звёзды уйдут с вашего баланса, получателю придёт сообщение о переводе.">
        <div className={styles.pad}>
          <TextField
            placeholder="Имя или @ник"
            value={to}
            onChange={(e) => {
              setTransferTo(null);
              setTo(e.target.value);
            }}
          />
          {transferTo ? (
            <p className={styles.hint}>Получатель: {transferTo.name}</p>
          ) : found.length ? (
            <div className={styles.candidates}>
              {found.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={styles.candidate}
                  onClick={() => {
                    setTransferTo(u);
                    setTo(u.name);
                  }}
                >
                  {u.username ? `${u.name} · @${u.username}` : u.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.priceRow}>
            <TextField className={styles.mono} type="number" min="1" step="1" placeholder="Сколько ⭐" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button disabled={busy} onClick={() => void sendTransfer()}>
              Отправить
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="На что тратятся">
        <CostRow icon="Zap" color="#ef6922" title="Поднять своё сообщение" subtitle={`${data.costs.boost} ⭐ на ${data.costs.boostMinutes} мин.`} />
        <CostRow icon="Trash" color="#db374b" title="Удалить чужое сообщение в личке" subtitle={`${data.costs.delete} ⭐`} />
        <CostRow icon="MessageSquare" color="#8958ff" title="Написать тому, кто берёт плату" subtitle="Цену назначает получатель" />
        <CostRow icon="Gift" color="#4492ff" title="Подарки" subtitle="Магазин подарков — цены в звёздах" />
      </SettingsSection>

      <SettingsSection
        title="Плата за сообщения мне"
        titleId={priceLabelId}
        caption={`Сколько звёзд платит тот, кто пишет вам впервые. 0 — бесплатно для всех. Ваши контакты и те, кому вы уже отвечали, не платят никогда. Максимум ${data.costs.maxMessagePrice} ⭐.`}
      >
        <div className={styles.pad}>
          <div className={styles.priceRow}>
            <TextField aria-labelledby={priceLabelId} className={styles.mono} type="number" min="0" step="1" value={price ?? String(data.messagePriceStars)} onChange={(e) => setPrice(e.target.value)} />
            <Button onClick={() => void savePrice()}>Сохранить</Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

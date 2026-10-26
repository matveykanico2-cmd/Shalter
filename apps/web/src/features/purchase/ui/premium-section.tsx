import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { openGiftShop } from "@/entities/gift";
import { sessionQueries } from "@/entities/session";
import { bestPlan, handlePurchaseResponse, PlanOption, planRows, starsQueries } from "@/entities/stars";

import { errorText } from "@/shared/lib/error-text";
import { EmojiText, Icon, SettingsPage, SettingsRow, SettingsSection } from "@/shared/ui";

import { buyPremiumWithStars, type PremiumInfo, premiumQueries, requestPremium } from "../api/purchase";
import { formatPremiumUntil, PREMIUM_COMPARE, PREMIUM_PERKS } from "../lib/premium-plans";

import { PremiumFeaturesDialog } from "./premium-features-dialog";
import styles from "./purchase.module.css";

/** «Настройки → Shalter Premium» (renderPremium): срок, оплата рублями или звёздами, возможности и сравнение. */
export function PremiumSection() {
  const info = useQuery(premiumQueries.me());
  if (!info.data) {
    return (
      <SettingsPage>
        <p className={info.error ? styles.error : styles.hintCenter}>{info.error ? errorText(info.error, "Не удалось загрузить") : "Загружаем…"}</p>
      </SettingsPage>
    );
  }
  return <Premium info={info.data} />;
}

function Premium({ info }: { info: PremiumInfo }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const plans = planRows(info.plans);
  const [selected, setSelected] = useState(() => bestPlan(plans));
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [features, setFeatures] = useState<number | null>(null);

  const current = plans.find((p) => p.id === selected);
  const canBuy = !info.premiumForever && plans.length > 0;
  const notEnoughStars = !!current?.stars && info.starsBalance < current.stars;

  const run = async (fn: () => Promise<void>) => {
    if (!selected) return;
    setBuying(true);
    setBuyError(null);
    try {
      await fn();
    } catch (err) {
      setBuyError(errorText(err, "Не удалось оформить покупку"));
    }
    setBuying(false);
  };
  const buyPremium = () => run(async () => handlePurchaseResponse(await requestPremium(selected!), (chatId) => void navigate(`/chat/${chatId}`)));
  const buyWithStars = () =>
    run(async () => {
      const res = await buyPremiumWithStars(selected!);
      // Premium виден сразу везде: сессия, экран Premium, баланс звёзд.
      void client.invalidateQueries({ queryKey: sessionQueries.current().queryKey });
      void client.invalidateQueries({ queryKey: premiumQueries.me().queryKey });
      void client.invalidateQueries({ queryKey: starsQueries.info().queryKey });
      if (res.chatId) void navigate(`/chat/${res.chatId}`);
    });

  return (
    <SettingsPage>
      <div className={styles.hero}>
        <img className={styles.heroStar} src="/img/tweb/premium-star.png" alt="" width={100} height={100} />
        <h2 className={styles.mediaTitle}>{info.isPremium ? "У вас Shalter Premium" : "Shalter Premium"}</h2>
        <p className={styles.mediaSubtitle}>
          {info.isPremium ? formatPremiumUntil(info) : "Больше возможностей, особый значок и эксклюзивные реакции — без ограничений обычного аккаунта."}
        </p>
      </div>
      {canBuy ? (
        <SettingsSection
          title={info.isPremium ? "Продлить Premium" : "Выберите срок"}
          caption={
            info.isPremium
              ? "Новый срок прибавится к текущей дате окончания. Автопродления нет — списаний без вашего ведома не будет."
              : "Оплата переводом администрации Shalter. Автопродления нет — срок просто закончится сам."
          }
        >
          <div role="radiogroup">
            {plans.map((p) => (
              <PlanOption key={p.id} plan={p} selected={p.id === selected} disabled={buying} onSelect={() => setSelected(p.id)} />
            ))}
          </div>
        </SettingsSection>
      ) : null}
      {buyError ? <p className={styles.error}>{buyError}</p> : null}
      <SettingsSection title="Что даёт Premium">
        {PREMIUM_PERKS.map((p, i) => (
          <button key={p.title} type="button" className={`${styles.costRow} ${styles.perk}`} onClick={() => setFeatures(i)}>
            <span className={styles.costIcon} style={{ background: p.color }}>
              <Icon name={p.icon} size={20} />
            </span>
            <span className={styles.costBody}>
              <span>{p.title}</span> <span className={styles.muted}>{p.desc}</span>
            </span>
          </button>
        ))}
      </SettingsSection>
      <SettingsSection title="Сравнение">
        <div className={styles.compare}>
          <div className={styles.compareHead}>
            <span>Возможность</span>
            <span>Бесплатно</span>
            <span>Premium</span>
          </div>
          {PREMIUM_COMPARE.map(([title, free, prem]) => (
            <div key={title} className={styles.compareRow}>
              <span>
                <EmojiText text={title} />
              </span>
              <span className={styles.muted}>
                <EmojiText text={free} />
              </span>
              <span className={styles.comparePrem}>{prem}</span>
            </div>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection>
        <SettingsRow icon="Link" title="Публичная страница Premium" subtitle="Откроется у любого, даже без аккаунта" href="/premium" external />
        <SettingsRow icon="Gift" title="Магазин подарков" subtitle="Цены в звёздах, отправка мгновенная" onClick={() => openGiftShop({})} />
      </SettingsSection>
      {canBuy ? (
        <div className={styles.footer}>
          <button type="button" className={styles.premiumButton} disabled={buying || !current} onClick={() => void buyPremium()}>
            {buying ? "Открываем оплату…" : `${info.isPremium ? "Продлить" : "Подписаться"} за ${current?.priceRub ?? 0} ₽`}
          </button>
          {current?.stars ? (
            <button type="button" className={styles.starsButton} disabled={buying || notEnoughStars} onClick={() => void buyWithStars()}>
              <EmojiText
                text={notEnoughStars ? `Не хватает звёзд: нужно ${current.stars} ⭐, у вас ${info.starsBalance}` : `Или за ${current.stars} ⭐ (у вас ${info.starsBalance})`}
              />
            </button>
          ) : null}
        </div>
      ) : null}
      {features != null ? (
        <PremiumFeaturesDialog
          features={PREMIUM_PERKS}
          start={features}
          isPremium={info.isPremium}
          onSubscribe={() => void buyPremium()}
          onClose={() => setFeatures(null)}
        />
      ) : null}
    </SettingsPage>
  );
}

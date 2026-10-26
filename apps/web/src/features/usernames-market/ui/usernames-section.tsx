import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { sessionQueries } from "@/entities/session";
import { starsQueries } from "@/entities/stars";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, Button, EmojiText, SettingsPage, TextField } from "@/shared/ui";

import {
  type Auction,
  type Auctions,
  bidUsername,
  buyUsername,
  closeAuction,
  createAuction,
  deleteAuction,
  grantUsername,
  sellUsername,
  usernamesQueries,
  withdrawListing,
} from "../api/usernames";

import styles from "./usernames.module.css";

const STATUS: Record<string, string> = { open: "идёт", sold: "продан", unsold: "не продан", cancelled: "отменён" };

function left(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "завершается…";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h ? `осталось ${h} ч ${m} мин` : `осталось ${m} мин`;
}

const Hint = ({ text }: { text: string }) => (
  <p className={styles.hint}>
    <EmojiText text={text} />
  </p>
);

/**
 * «Настройки → Аукцион юзернеймов» (renderUsernames): рынок, где владельцы продают свои @имена,
 * и аукционы коротких имён; админу — выставить на аукцион и выдать напрямую.
 */
export function UsernamesSection() {
  const client = useQueryClient();
  const auctions = useQuery(usernamesQueries.auctions());
  const market = useQuery(usernamesQueries.market());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [auctionName, setAuctionName] = useState("");
  const [startPrice, setStartPrice] = useState("100");
  const [hours, setHours] = useState("24");
  const [grantPhone, setGrantPhone] = useState("");
  const [grantName, setGrantName] = useState("");

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      // Ник и звёзды могли перейти — обновляем всё, что их показывает.
      await Promise.all([
        client.refetchQueries({ queryKey: usernamesQueries.auctions().queryKey }),
        client.refetchQueries({ queryKey: usernamesQueries.market().queryKey }),
      ]);
      void client.invalidateQueries({ queryKey: sessionQueries.current().queryKey });
      void client.invalidateQueries({ queryKey: starsQueries.info().queryKey });
    } catch (err) {
      setError(errorText(err, "Не получилось"));
    }
    setBusy(false);
  };

  const data = auctions.data;
  if (!data) {
    return (
      <SettingsPage>
        <p className={auctions.error ? styles.error : styles.hint}>{auctions.error ? errorText(auctions.error, "Не удалось загрузить аукционы") : "Загружаем…"}</p>
      </SettingsPage>
    );
  }
  const listings = market.data?.listings ?? [];
  const balance = market.data?.balance ?? 0;
  const open = data.auctions.filter((a) => a.status === "open");
  const done = data.auctions.filter((a) => a.status !== "open");

  return (
    <SettingsPage subtitle="Короткие @имена — от 3 символов">
      {notice ? (
        <p className={styles.notice}>
          <EmojiText text={`✅ ${notice}`} />
        </p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      <Hint text={`На балансе: ${data.balance} ⭐. Звёзды списываются только у победителя и только в момент завершения — до этого баланс не блокируется.`} />

      <Block title="Рынок юзернеймов">
        <p className={styles.hint}>Хендлы, которые продают их владельцы. Покупка мгновенная: звёзды уходят продавцу, юзернейм — вам.</p>
        {listings.length ? (
          listings.map((l) => (
            <div key={l.id} className={styles.card}>
              <div className={styles.head}>
                <span className={styles.name}>@{l.username}</span>
                <span className={styles.status}>
                  <EmojiText text={`${l.priceStars} ⭐`} />
                </span>
              </div>
              <p className={styles.hint}>{l.mine ? "Ваше объявление" : `Продавец: ${l.seller?.name ?? "—"}`}</p>
              {l.mine ? (
                <Button variant="link" className={styles.dangerLink} disabled={busy} onClick={() => void act(() => withdrawListing(l.id), "Объявление снято")}>
                  Снять с продажи
                </Button>
              ) : (
                <Button disabled={busy || balance < l.priceStars} onClick={() => void act(() => buyUsername(l.id), `@${l.username} теперь ваш`)}>
                  <EmojiText text={balance < l.priceStars ? `Не хватает ${l.priceStars - balance} ⭐` : `Купить за ${l.priceStars} ⭐`} />
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className={styles.empty}>Пока никто ничего не продаёт</p>
        )}
        <p className={styles.blockTitle}>Продать свой</p>
        <p className={styles.hint}>Продаётся тот юзернейм, который на вас сейчас. После покупки он перейдёт покупателю, а вы сможете занять новый.</p>
        <div className={styles.row}>
          <TextField className={styles.mono} type="number" min="10" placeholder="Цена, ⭐" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
          <Button disabled={busy} onClick={() => void act(() => sellUsername(Number(sellPrice)), "Объявление размещено")}>
            Выставить
          </Button>
        </div>
      </Block>

      {data.isAdmin ? (
        <Block title="Выставить юзернейм">
          <div className={styles.grid}>
            <TextField className={styles.mono} placeholder="юзернейм" value={auctionName} onChange={(e) => setAuctionName(e.target.value)} />
            <TextField className={styles.mono} type="number" min="0" placeholder="Старт, ⭐" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} />
            <TextField className={styles.mono} type="number" min="1" placeholder="Часов" value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <Button disabled={busy} onClick={() => void act(() => createAuction(auctionName.trim(), Number(startPrice), Number(hours)), "Аукцион создан")}>
            Выставить
          </Button>
        </Block>
      ) : null}

      {data.isAdmin ? (
        <Block title="Выдать юзернейм напрямую">
          <p className={styles.hint}>Без аукциона — например, за заслуги или по договорённости. Найдём по номеру телефона.</p>
          <div className={styles.row}>
            <TextField className={styles.mono} type="tel" placeholder="+7 999 123 45 67" value={grantPhone} onChange={(e) => setGrantPhone(e.target.value)} />
            <TextField className={styles.mono} placeholder="юзернейм" value={grantName} onChange={(e) => setGrantName(e.target.value)} />
          </div>
          <Button disabled={busy} onClick={() => void act(() => grantUsername(grantPhone.trim(), grantName.trim()), "Юзернейм выдан")}>
            Выдать
          </Button>
        </Block>
      ) : null}

      <p className={styles.blockTitle}>Идут торги ({open.length})</p>
      {open.length ? (
        <div className={styles.list}>
          {open.map((a) => (
            <AuctionCard key={`${a.id}:${a.topBid ?? ""}`} auction={a} data={data} busy={busy} act={act} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Сейчас ничего не разыгрывается</p>
      )}
      {done.length ? (
        <>
          <p className={styles.blockTitle}>Завершённые</p>
          <div className={styles.list}>
            {done.map((a) => (
              <AuctionCard key={`${a.id}:${a.topBid ?? ""}`} auction={a} data={data} busy={busy} act={act} />
            ))}
          </div>
        </>
      ) : null}
    </SettingsPage>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.block}>
      <p className={styles.blockTitle}>{title}</p>
      <div className={styles.blockBody}>{children}</div>
    </div>
  );
}

type CardProps = { auction: Auction; data: Auctions; busy: boolean; act: (fn: () => Promise<unknown>, ok: string) => Promise<void> };

function AuctionCard({ auction: a, data, busy, act }: CardProps) {
  const floor = a.topBid == null ? a.startPriceStars : a.topBid + data.minStep;
  const [bid, setBid] = useState(String(floor));
  const isTop = a.topBidderId != null && a.myBid === a.topBid;
  return (
    <div className={a.status !== "open" ? `${styles.card} ${styles.closed}` : styles.card}>
      <div className={styles.head}>
        <span className={styles.name}>@{a.username}</span>
        <span className={styles.status}>{a.status === "open" ? left(a.endsAt) : (STATUS[a.status] ?? a.status)}</span>
      </div>
      <Hint
        text={
          a.topBid == null
            ? `Стартовая цена: ${a.startPriceStars} ⭐ — ставок пока нет`
            : `Текущая ставка: ${a.topBid} ⭐ · ${a.topBidder?.name ?? "участник"}${isTop ? " (это вы)" : ""}`
        }
      />
      {a.status === "sold" ? <Hint text={`Продан за ${a.soldForStars} ⭐`} /> : null}
      {a.myBid != null && a.status === "open" ? <Hint text={`Ваша ставка: ${a.myBid} ⭐`} /> : null}
      {a.status === "open" ? (
        <div className={styles.row}>
          <TextField className={styles.mono} type="number" min={String(floor)} value={bid} onChange={(e) => setBid(e.target.value)} />
          <Button disabled={busy} onClick={() => void act(() => bidUsername(a.id, Number(bid)), "Ставка принята")}>
            Поставить
          </Button>
        </div>
      ) : null}
      {data.isAdmin && a.status === "open" ? (
        <div className={styles.row}>
          <Button variant="secondary" disabled={busy} onClick={() => void act(() => closeAuction(a.id), "Аукцион завершён")}>
            Завершить сейчас
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void askConfirm(`Отменить аукцион @${a.username}? Ставки аннулируются, звёзды не списывались.`, { okLabel: "Отменить", danger: true }).then(
                (ok) => {
                  if (ok) void act(() => deleteAuction(a.id), "Аукцион отменён");
                }
              )
            }
          >
            Отменить
          </Button>
        </div>
      ) : null}
    </div>
  );
}

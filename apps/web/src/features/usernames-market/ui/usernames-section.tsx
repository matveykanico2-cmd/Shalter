import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { sessionQueries } from "@/entities/session";
import { starsQueries } from "@/entities/stars";

import { errorText } from "@/shared/lib/error-text";
import { askConfirm, askText, Avatar, Button, Dialog, EmojiText, SettingsPage, TextField } from "@/shared/ui";

import type { ContactRecipient } from "../api/usernames";
import {
  activateUsername,
  type Auction,
  type Auctions,
  bidUsername,
  buyUsername,
  closeAuction,
  createAuction,
  deleteAuction,
  grantUsername,
  pinUsername,
  sellUsername,
  setPrimaryUsername,
  transferUsername,
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

const Hint = ({ text, inset }: { text: string; inset?: boolean }) => (
  <p className={inset ? `${styles.hint} ${styles.hintInset}` : styles.hint}>
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
  const mine = useQuery(usernamesQueries.mine());
  const session = useQuery(sessionQueries.current());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [auctionName, setAuctionName] = useState("");
  const [startPrice, setStartPrice] = useState("100");
  const [hours, setHours] = useState("24");
  const [grantPhone, setGrantPhone] = useState("");
  const [grantName, setGrantName] = useState("");
  const [transfer, setTransfer] = useState<{ id: string; username: string } | null>(null);

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
        client.refetchQueries({ queryKey: usernamesQueries.mine().queryKey }),
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
  const owned = market.data?.owned ?? [];
  const balance = market.data?.balance ?? 0;
  const myUsernames = mine.data?.usernames ?? [];
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
      <Hint inset text={`На балансе: ${data.balance} ⭐. Звёзды списываются только у победителя и только в момент завершения — до этого баланс не блокируется.`} />

      <Block title="Мои юзернеймы">
        <p className={styles.hint}>Основной юзернейм показывается в профиле. Остальные можно закрепить и переключать в любой момент.</p>
        {myUsernames.length ? myUsernames.map((item) => (
          <div key={item.username} className={styles.card}>
            <div className={styles.head}><span className={styles.name}>@{item.username}</span><span className={styles.badges}>{item.primary ? <span className={styles.activeBadge}>Основной</span> : null}{item.pinned ? <span className={styles.badge}>Закреплён</span> : null}</span></div>
            <div className={styles.row}>
              {!item.primary ? <Button variant="secondary" disabled={busy} onClick={() => void act(() => setPrimaryUsername(item.username), `@${item.username} теперь основной`)}>Сделать основным</Button> : null}
              {!item.primary ? <Button variant="link" disabled={busy} onClick={() => void act(() => pinUsername(item.username, !item.pinned), item.pinned ? `@${item.username} откреплён` : `@${item.username} закреплён`)}>{item.pinned ? "Открепить" : "Закрепить"}</Button> : null}
              {data.isAdmin ? <Button variant="link" disabled={busy} onClick={() => void askText("Цена продажи в звёздах", { placeholder: "Минимум 10" }).then((value) => { const price = Number(value); if (Number.isFinite(price) && price >= 10) void act(() => sellUsername(price, item.username), "Юзернейм выставлен на продажу"); })}>Продать</Button> : null}
            </div>
          </div>
        )) : <p className={styles.empty}>Юзернеймов пока нет</p>}
      </Block>

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
        {data.isAdmin ? (
          <>
            <p className={styles.blockTitle}>Продать свой</p>
            <p className={styles.hint}>Администратор может выставить любой дополнительный юзернейм. Основной сначала переключите на другой.</p>
            <div className={styles.row}>
              <TextField className={styles.mono} type="number" min="10" placeholder="Цена, ⭐" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
              <Button disabled={busy} onClick={() => void act(() => sellUsername(Number(sellPrice)), "Объявление размещено")}>
                Выставить
              </Button>
            </div>
          </>
        ) : null}
      </Block>

      {owned.length ? (
        <Block title="Мои юзернеймы">
          <p className={styles.hint}>У аккаунта может быть несколько купленных имён. Активное имя показывается в профиле, остальные остаются зарезервированными за вами.</p>
          {owned.map((item) => (
            <div key={item.id} className={styles.card}>
              <div className={styles.head}>
                <span className={styles.name}>@{item.username}</span>
                <span className={styles.badges}>
                  <span className={styles.badge}>Куплен</span>
                  <span className={styles.priceBadge}>{item.priceStars} ⭐</span>
                </span>
              </div>
              <div className={styles.row}>
                {session.data?.user?.username?.toLowerCase() === item.username.toLowerCase() ? (
                  <span className={styles.activeBadge}>Главный</span>
                ) : session.data?.user ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      const user = session.data?.user;
                      if (user) void act(() => activateUsername(user.id, item.username), `@${item.username} установлен`);
                    }}
                  >
                    Сделать главным
                  </Button>
                ) : null}
                <Button
                  variant="link"
                  disabled={busy}
                  onClick={() => setTransfer({ id: item.id, username: item.username })}
                >
                  Передать
                </Button>
              </div>
            </div>
          ))}
        </Block>
      ) : null}

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
      {transfer ? (
        <TransferRecipientDialog
          username={transfer.username}
          onClose={() => setTransfer(null)}
          onChoose={(target) => {
            setTransfer(null);
            void askConfirm(`Передать @${transfer.username} пользователю ${target}?`, { okLabel: "Передать" }).then((ok) => {
              if (ok) void act(() => transferUsername(transfer.id, target), "Юзернейм передан");
            });
          }}
        />
      ) : null}
    </SettingsPage>
  );
}

function TransferRecipientDialog({ username, onClose, onChoose }: { username: string; onClose: () => void; onChoose: (target: string) => void }) {
  const contacts = useQuery(usernamesQueries.recipients()).data ?? [];
  const [query, setQuery] = useState("");
  const q = query.trim();
  const search = useQuery({ ...usernamesQueries.recipientSearch(q), enabled: q.length >= 2 });
  const users = search.data?.users ?? [];
  const contactMatches = contacts.filter((contact) => matchesRecipient(contact, q));
  const seen = new Set<string>();
  const rows = [
    ...contactMatches.map((contact) => ({
      key: contact.user.id,
      user: contact.user,
      label: contact.localName || contact.user.name,
      target: contact.user.username || contact.user.phone,
    })),
    ...users.map((user) => ({ key: user.id, user, label: user.name, target: user.username || user.phone })),
  ].filter((row) => row.target && !seen.has(row.key) && (seen.add(row.key), true));

  return (
    <Dialog title={`Передать @${username}`} onClose={onClose}>
      <p className={styles.hint}>Выберите контакт или найдите пользователя по имени, @юзу или номеру.</p>
      <TextField type="search" placeholder="Имя, @username или номер" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className={styles.recipientList}>
        {rows.map((row) => (
          <button key={row.key} type="button" className={styles.recipient} onClick={() => row.target && onChoose(row.target)}>
            <Avatar size={34} name={row.user.name} color={row.user.avatarColor} image={row.user.avatarImage} emoji={row.user.avatarEmoji} />
            <span className={styles.recipientText}>
              <strong>{row.label}</strong>
              <small>{row.user.username ? `@${row.user.username}` : row.user.phone || "Пользователь"}</small>
            </span>
          </button>
        ))}
        {!rows.length && q.length >= 2 && !search.isPending ? <p className={styles.empty}>Ничего не найдено</p> : null}
      </div>
      <Button variant="secondary" disabled={!q} onClick={() => onChoose(q)}>
        Передать на введённый @юз или номер
      </Button>
      <Button variant="link" onClick={onClose}>Отмена</Button>
    </Dialog>
  );
}

function matchesRecipient(contact: ContactRecipient, query: string) {
  if (!query) return true;
  const q = query.toLowerCase().replace(/^@/, "");
  return [contact.localName, contact.user.name, contact.user.username, contact.user.phone].some((value) => String(value ?? "").toLowerCase().includes(q));
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} className={styles.block}>
      <p id={titleId} className={styles.blockTitle}>
        {title}
      </p>
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

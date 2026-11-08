import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useSession } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { Button, SettingsPage, SettingsSection, TextField, toast } from "@/shared/ui";

import { createCoin, type ExchangeCoin, exchangeQueries, setExchangeCreator, updateCoinRate } from "../api/exchange";

import styles from "./exchange.module.css";

const money = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function ExchangeSection() {
  const client = useQueryClient();
  const me = useSession().data?.user;
  const query = useQuery(exchangeQueries.list());
  const isAdmin = query.data?.permissions.isAdmin ?? false;
  const creators = useQuery(exchangeQueries.creators(isAdmin));
  const refresh = () => void client.invalidateQueries({ queryKey: ["exchange"] });
  const create = useMutation({ mutationFn: createCoin, onSuccess: () => { refresh(); toast("Монета создана"); }, onError: (e) => toast(errorText(e, "Не удалось создать монету"), { error: true }) });
  const rate = useMutation({ mutationFn: ({ id, value }: { id: string; value: number }) => updateCoinRate(id, value), onSuccess: refresh, onError: (e) => toast(errorText(e, "Не удалось изменить курс"), { error: true }) });
  const creator = useMutation({ mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setExchangeCreator(id, enabled), onSuccess: refresh, onError: (e) => toast(errorText(e, "Не удалось изменить доступ"), { error: true }) });

  if (query.isPending) return <SettingsPage title="Биржа монет"><p className={styles.state}>Загрузка котировок…</p></SettingsPage>;
  if (query.isError || !query.data) return <SettingsPage title="Биржа монет"><p className={styles.state}>Не удалось загрузить биржу</p></SettingsPage>;
  return (
    <SettingsPage title="Биржа монет" subtitle="Информационная витрина Shalter. Покупка, продажа и перевод монет отключены.">
      <div className={styles.hero}>
        <div><span className={styles.live}><i /> Котировки</span><h2>Рынок Shalter</h2><p>Наблюдайте за курсом и историей изменений. Это виртуальные показатели, не финансовый инструмент.</p></div>
        <div className={styles.heroCount}>{query.data.coins.length}<small>монет</small></div>
      </div>
      <div className={styles.grid}>
        {query.data.coins.map((coin) => <CoinCard key={coin.id} coin={coin} canEdit={isAdmin || (query.data.permissions.canCreate && coin.createdBy === me?.id)} onRate={(value) => rate.mutate({ id: coin.id, value })} busy={rate.isPending} />)}
        {!query.data.coins.length ? <p className={styles.empty}>Монет пока нет. Администратор или назначенный создатель может добавить первую.</p> : null}
      </div>
      {query.data.permissions.canCreate ? <CreateCoin busy={create.isPending} onCreate={(data) => create.mutate(data)} /> : null}
      {isAdmin ? <CreatorAccess creators={creators.data ?? []} busy={creator.isPending} onSet={(id, enabled) => creator.mutate({ id, enabled })} /> : null}
    </SettingsPage>
  );
}

function CoinCard({ coin, canEdit, onRate, busy }: { coin: ExchangeCoin; canEdit: boolean; onRate: (rate: number) => void; busy: boolean }) {
  const [next, setNext] = useState(String(coin.currentRate));
  const positive = coin.changePercent >= 0;
  return <article className={styles.card} style={{ "--coin": coin.color } as React.CSSProperties}>
    <header><span className={styles.coinIcon}>{coin.symbol.slice(0, 2)}</span><div><h3>{coin.name}</h3><span>{coin.symbol}</span></div><strong className={positive ? styles.up : styles.down}>{positive ? "+" : ""}{coin.changePercent.toFixed(2)}%</strong></header>
    <div className={styles.rate}>{money.format(coin.currentRate)} <small>₽</small></div>
    <RateChart coin={coin} />
    {coin.description ? <p className={styles.description}>{coin.description}</p> : null}
    <footer><span>{coin.history.length} {coin.history.length === 1 ? "точка" : "точек"}</span><span>Торговля недоступна</span></footer>
    {canEdit ? <form className={styles.rateForm} onSubmit={(e) => { e.preventDefault(); const value = Number(next); if (value > 0) onRate(value); }}><TextField aria-label={`Новый курс ${coin.symbol}`} inputMode="decimal" value={next} onChange={(e) => setNext(e.target.value)} /><Button disabled={busy}>Изменить курс</Button></form> : null}
  </article>;
}

function RateChart({ coin }: { coin: ExchangeCoin }) {
  const values = coin.history.map((point) => point.rate);
  if (values.length === 1) values.push(values[0]!);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((value, i) => `${(i / Math.max(1, values.length - 1)) * 300},${86 - ((value - min) / range) * 72}`).join(" ");
  return <svg className={styles.chart} viewBox="0 0 300 100" role="img" aria-label={`График курса ${coin.symbol}`} preserveAspectRatio="none"><defs><linearGradient id={`fill-${coin.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={coin.color} stopOpacity=".32"/><stop offset="1" stopColor={coin.color} stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${points} 300,100`} fill={`url(#fill-${coin.id})`}/><polyline points={points} fill="none" stroke={coin.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>;
}

function CreateCoin({ busy, onCreate }: { busy: boolean; onCreate: (data: { symbol: string; name: string; description: string; color: string; rate: number }) => void }) {
  const [form, setForm] = useState({ symbol: "", name: "", description: "", color: "#2aabee", rate: "1" });
  return <SettingsSection title="Создать монету" caption="Создатель сможет менять курс только созданных им монет."><form className={styles.form} onSubmit={(e) => { e.preventDefault(); onCreate({ ...form, symbol: form.symbol.toUpperCase(), rate: Number(form.rate) }); }}><TextField aria-label="Тикер монеты" placeholder="Тикер, например SHT" value={form.symbol} maxLength={10} onChange={(e) => setForm({ ...form, symbol: e.target.value })}/><TextField aria-label="Название монеты" placeholder="Название" value={form.name} maxLength={48} onChange={(e) => setForm({ ...form, name: e.target.value })}/><TextField aria-label="Описание монеты" placeholder="Короткое описание" value={form.description} maxLength={240} onChange={(e) => setForm({ ...form, description: e.target.value })}/><label className={styles.color}>Цвет <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}/></label><TextField aria-label="Начальный курс" inputMode="decimal" placeholder="Начальный курс" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })}/><Button disabled={busy}>{busy ? "Создаём…" : "Создать монету"}</Button></form></SettingsSection>;
}

function CreatorAccess({ creators, busy, onSet }: { creators: { userId: string; name: string; username: string | null }[]; busy: boolean; onSet: (id: string, enabled: boolean) => void }) {
  const [id, setId] = useState("");
  return <SettingsSection title="Создатели монет" caption="Введите ID пользователя. Право позволяет создавать монеты, но не управлять чужими."><form className={styles.accessForm} onSubmit={(e) => { e.preventDefault(); if (id.trim()) { onSet(id.trim(), true); setId(""); } }}><TextField aria-label="ID нового создателя" placeholder="u_…" value={id} onChange={(e) => setId(e.target.value)}/><Button disabled={busy}>Выдать право</Button></form><div className={styles.creators}>{creators.map((item) => <div key={item.userId}><span><b>{item.name}</b><small>{item.username ? `@${item.username}` : item.userId}</small></span><Button variant="secondary" disabled={busy} onClick={() => onSet(item.userId, false)}>Убрать</Button></div>)}</div></SettingsSection>;
}

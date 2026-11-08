import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { errorText } from "@/shared/lib/error-text";
import { Button, Dialog, TextField, toast } from "@/shared/ui";

import { exchangeQueries, transferCoin } from "../api/exchange";

import styles from "./exchange.module.css";

type Person = { id: string; name: string };

export function CoinTransferDialog({ chatId, people, onClose }: { chatId: string; people: readonly Person[]; onClose: () => void }) {
  const client = useQueryClient();
  const wallet = useQuery(exchangeQueries.wallet());
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [coinId, setCoinId] = useState("");
  const [amount, setAmount] = useState("1");
  const send = useMutation({
    mutationFn: transferCoin,
    onSuccess: (data) => {
      client.setQueryData(exchangeQueries.wallet().queryKey, data.wallet);
      toast("Монеты отправлены в чат");
      onClose();
    },
    onError: (error) => toast(errorText(error, "Не удалось отправить монеты"), { error: true }),
  });
  const balances = wallet.data?.balances ?? [];
  const selected = coinId || balances[0]?.coin.id || "";
  return (
    <Dialog title="Отправить монеты" onClose={onClose}>
      {!people.length ? <p>В этом чате нет другого получателя.</p> : null}
      {!balances.length && !wallet.isPending ? <p>В кошельке пока нет монет.</p> : null}
      {people.length && balances.length ? (
        <form className={styles.walletForm} onSubmit={(event) => { event.preventDefault(); send.mutate({ chatId, userId, coinId: selected, amount: Number(amount) }); }}>
          <label>Получатель<select value={userId} onChange={(event) => setUserId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label>Монета<select value={selected} onChange={(event) => setCoinId(event.target.value)}>{balances.map((balance) => <option key={balance.coin.id} value={balance.coin.id}>{balance.coin.symbol} · доступно {balance.amount}</option>)}</select></label>
          <TextField aria-label="Количество монет" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <Button disabled={send.isPending || Number(amount) <= 0}>{send.isPending ? "Отправляем…" : "Отправить в чат"}</Button>
        </form>
      ) : null}
    </Dialog>
  );
}

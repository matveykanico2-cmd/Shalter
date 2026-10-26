import { useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { chatCache, type ChatSummary, levelBounds, levelForPoints, pointsToNextLevel } from "@/entities/chat";
import type { SelfUser } from "@/entities/session";

import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { Avatar, Button, Dialog, Icon, toast } from "@/shared/ui";

import { boostChat } from "../api/boost-chat";
import { boostedWithinDay } from "../lib/boosted";

import styles from "./boost.module.css";

const boosts = (n: number) => plural(n, "буст", "буста", "бустов");

/** Карточка «Бусты · уровень N» в информации о группе или канале (tw-boost-card). */
export function BoostCard({ chat, me }: { chat: ChatSummary; me: SelfUser }) {
  const [open, setOpen] = useState(false);
  const points = chat.points ?? 0;
  const level = levelForPoints(points);
  const left = pointsToNextLevel(points);
  return (
    <>
      <button type="button" className={styles.row} onClick={() => setOpen(true)}>
        <span className={styles.rowIcon}>
          <Icon name="Zap" size={20} />
        </span>
        <span className={styles.rowBody}>
          <span className={styles.rowTitle}>Бусты · уровень {level}</span>
          <span className={styles.rowSub}>
            {points} {boosts(points)} · {left != null ? `до уровня ${level + 1} ещё ${left}` : "максимальный уровень"}
          </span>
        </span>
        <span className={styles.rowAction}>{me.isPremium ? "Бустнуть" : "Premium"}</span>
      </button>
      {open ? <BoostDialog chat={chat} me={me} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Окно буста как в public/js/components/boostPopup.js: полоса «Уровень N → N+1» и кнопка. */
function BoostDialog({ chat, me, onClose }: { chat: ChatSummary; me: SelfUser; onClose: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const isChannel = chat.type === "channel";
  const what = isChannel ? "канал" : "группу";
  const points = chat.points ?? 0;
  const { level, from, to } = levelBounds(points);
  const progress = to == null ? 100 : Math.max(4, Math.min(100, Math.round(((points - from) / (to - from)) * 100)));
  const boostedToday = boostedWithinDay(chat.votes[me.id]);
  const left = to == null ? 0 : to - points;

  const boost = async () => {
    setBusy(true);
    try {
      const { chat: updated } = await boostChat(chat.id);
      chatCache.patchChat(client, chat.id, { points: updated.points, votes: updated.votes });
    } catch (err) {
      toast(errorText(err, "Не удалось бустнуть"), { error: true });
    }
    setBusy(false);
  };

  const hintClass = [styles.hint, progress >= 92 ? styles.hintEnd : progress <= 8 ? styles.hintStart : "", shown ? styles.hintShown : ""].filter(Boolean).join(" ");
  return (
    <Dialog title={boostedToday ? "Вы уже бустили сегодня" : to == null ? "Максимальный уровень" : "Нужно больше бустов"} onClose={onClose} className={styles.dialog}>
      <div className={styles.entity}>
        <Avatar size={30} name={chat.title ?? ""} color={chat.avatarColor} image={chat.avatarImage} />
        <span>{chat.title}</span>
      </div>
      <div className={styles.meter} style={{ "--progress": `${progress}%` } as CSSProperties}>
        <div className={hintClass}>
          <Icon name="Zap" size={20} />
          <span>{points}</span>
        </div>
        <div className={styles.line} role="progressbar" aria-label="Бусты" aria-valuenow={points} aria-valuemin={from} aria-valuemax={to ?? points}>
          <div className={styles.fill} />
          <div className={styles.parts}>
            <span>Уровень {level}</span>
            {to == null ? null : <span>Уровень {level + 1}</span>}
          </div>
        </div>
      </div>
      <p className={styles.text}>
        {to == null
          ? `У ${isChannel ? "канала" : "группы"} максимальный уровень — спасибо всем, кто бустил!`
          : `Ещё ${left} ${boosts(left)} — и ${what} получит уровень ${level + 1}. Бустить можно раз в сутки.`}
      </p>
      {me.isPremium ? (
        <Button className={styles.upgrade} disabled={busy || boostedToday} onClick={() => void boost()}>
          <Icon name="Zap" size={20} />
          {boostedToday ? "Буст через сутки" : `Бустнуть ${what}`}
        </Button>
      ) : (
        <Button
          className={styles.upgrade}
          onClick={() => {
            onClose();
            void navigate("/settings/premium");
          }}
        >
          <Icon name="Star" size={20} />
          Бусты — с Shalter Premium
        </Button>
      )}
      <Button variant="link" onClick={onClose}>
        Закрыть
      </Button>
    </Dialog>
  );
}

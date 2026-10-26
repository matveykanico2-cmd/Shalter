import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { chatQueries } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { Avatar, Icon, toast } from "@/shared/ui";

import { type SimilarChannel, similarChannelsQueries, subscribeChannel } from "../api/similar-channels";

import styles from "./similar-channels.module.css";

function compactCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** «Похожие каналы» — горизонтальная лента (SimilarChannels в public/js/components/infoPanel.js). */
export function SimilarChannels({ chatId }: { chatId: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const channels = useQuery(similarChannelsQueries.similar(chatId)).data;
  if (!channels?.length) return null;

  const open = async (c: SimilarChannel) => {
    if (!c.isMember) {
      try {
        await subscribeChannel(c.id);
        await client.refetchQueries({ queryKey: chatQueries.list().queryKey });
      } catch (err) {
        toast(errorText(err, "Не удалось подписаться"), { error: true });
        return;
      }
    }
    void navigate(`/chat/${c.id}`);
  };

  return (
    <section className={styles.box} aria-label="Похожие каналы">
      <p className={styles.label}>Похожие каналы</p>
      <div className={styles.row}>
        {channels.map((c) => (
          <button key={c.id} type="button" className={styles.channel} title={c.title ?? ""} onClick={() => void open(c)}>
            <span className={styles.avatar}>
              <Avatar size={56} name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
              <span className={styles.count}>
                <Icon name="Users" size={10} />
                {compactCount(c.subscriberCount)}
              </span>
            </span>
            <span className={styles.title}>{c.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

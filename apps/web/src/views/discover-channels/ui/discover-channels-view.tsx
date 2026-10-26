import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { chatQueries } from "@/entities/chat";

import { errorText } from "@/shared/lib/error-text";
import { plural } from "@/shared/lib/presence";
import { askConfirm, Avatar, Button, Icon, TextField, toast } from "@/shared/ui";

import { clickAd, type DiscoverAd, discoverQueries, type FoundChannel, leaveChat, subscribeChannel } from "../api/discover";

import styles from "./discover-channels-view.module.css";

/** Каталог публичных каналов /discover-channels — public/js/views/discoverChannels.js. */
export function DiscoverChannelsView() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [query, setQuery] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const found = useQuery(discoverQueries.search(query));
  const ad = useQuery(discoverQueries.ad()).data;

  const refreshChats = () => client.refetchQueries({ queryKey: chatQueries.list().queryKey }).catch(() => {});
  const subscribe = async (c: FoundChannel) => {
    try {
      await subscribeChannel(c.id);
      await refreshChats();
      void navigate(`/chat/${c.id}`);
    } catch (err) {
      toast(errorText(err, "Не удалось подписаться"), { error: true });
    }
  };
  const unsubscribe = async (c: FoundChannel) => {
    if (!(await askConfirm(`Отписаться от «${c.title}»?`, { okLabel: "Отписаться" }))) return;
    try {
      await leaveChat(c.id);
      await refreshChats();
      void client.invalidateQueries({ queryKey: discoverQueries.baseKey });
    } catch (err) {
      toast(errorText(err, "Не удалось отписаться"), { error: true });
    }
  };

  const channels = found.data ?? [];
  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <button type="button" className={styles.back} title="Назад" aria-label="Назад" onClick={() => void navigate("/")}>
          <Icon name="ChevronLeft" size={20} />
        </button>
        <p className={styles.title}>Публичные каналы</p>
      </header>
      {ad ? <AdCard ad={ad} /> : null}
      <div className={styles.searchPanel}>
        <TextField value={search} placeholder="Поиск по названию или @юзернейму" aria-label="Поиск по названию или @юзернейму" onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className={styles.list}>
        {found.isPending ? (
          <p className={styles.empty}>Загрузка…</p>
        ) : !channels.length ? (
          <p className={styles.empty}>{query ? "Ничего не найдено" : "Публичных каналов пока нет"}</p>
        ) : (
          channels.map((c) => (
            <div key={c.id} className={styles.row}>
              {c.isMember ? (
                <button type="button" className={styles.profile} onClick={() => void navigate(`/chat/${c.id}`)}>
                  <ChannelInfo channel={c} />
                </button>
              ) : (
                <div className={styles.profile}>
                  <ChannelInfo channel={c} />
                </div>
              )}
              {c.isMember ? (
                <Button variant="danger" className={styles.action} onClick={() => void unsubscribe(c)}>
                  Отписаться
                </Button>
              ) : (
                <Button className={styles.action} onClick={() => void subscribe(c)}>
                  Подписаться
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChannelInfo({ channel: c }: { channel: FoundChannel }) {
  return (
    <>
      <Avatar name={c.title ?? ""} color={c.avatarColor} image={c.avatarImage} />
      <span className={styles.body}>
        <span className={styles.name}>{c.title}</span>
        <span className={styles.status}>
          {[c.username ? `@${c.username}` : null, `${c.subscriberCount} ${plural(c.subscriberCount, "подписчик", "подписчика", "подписчиков")}`].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );
}

/** Объявление над каталогом — .discover-ad; нажатие — openAd (lib/adLink.js). */
function AdCard({ ad }: { ad: DiscoverAd }) {
  const navigate = useNavigate();
  const open = async () => {
    await clickAd(ad.id).catch(() => {});
    const url = ad.url;
    if (!url) return;
    if (url.startsWith("/")) void navigate(url);
    else if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noreferrer");
  };
  return (
    <button type="button" className={styles.ad} onClick={() => void open()}>
      <span className={styles.adHead}>
        <span className={styles.adLabel}>РЕКЛАМА</span>
        {ad.title ? <span className={styles.adTitle}>{ad.title}</span> : null}
      </span>
      <span className={styles.adText}>{ad.text}</span>
      {ad.url ? <span className={styles.adGo}>Перейти →</span> : null}
    </button>
  );
}

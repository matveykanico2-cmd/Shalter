import { StoriesBar } from "@/features/stories";

import type { SelfUser } from "@/entities/session";

import styles from "./stories-view.module.css";

export function StoriesView({ me }: { me: SelfUser }) {
  return (
    <div className={styles.view}>
      <header><p>Shalter</p><h1>Истории</h1><span>Фото, видео, опросы и чек-листы исчезают через 24 часа</span></header>
      <section className={styles.card}><StoriesBar me={me} /></section>
      <section className={styles.info}><strong>Истории — отдельный формат</strong><span>Они не смешиваются с новостной лентой. Здесь можно публиковать фото, видео, текст, голос, опросы, чек-листы, места и игры.</span></section>
    </div>
  );
}

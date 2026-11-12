import styles from "./skeleton.module.css";

const ROWS = [62, 48, 70, 40, 56, 66, 44, 60];
const BUBBLES = [
  { out: false, width: 46 },
  { out: true, width: 34 },
  { out: false, width: 62 },
  { out: false, width: 28 },
  { out: true, width: 52 },
  { out: false, width: 40 },
];

/** Список чатов, пока он грузится: строки с кружком аватарки. */
export const ListSkeleton = ({ label = "Загрузка" }: { label?: string }) => (
  <div className={styles.list} role="status" aria-label={label} aria-busy="true">
    {ROWS.map((width, i) => (
      <div key={i} className={styles.row}>
        <span className={`${styles.avatar} ${styles.shape}`} />
        <span className={styles.lines}>
          <span className={`${styles.line} ${styles.shape}`} style={{ width: `${width}%` }} />
          <span className={`${styles.line} ${styles.shape}`} style={{ width: `${width + 20}%` }} />
        </span>
      </div>
    ))}
  </div>
);

/** Лента чата, пока история грузится: пузыри слева и справа. */
export const FeedSkeleton = ({ label = "Загрузка" }: { label?: string }) => (
  <div className={styles.feed} role="status" aria-label={label} aria-busy="true">
    {BUBBLES.map((b, i) => (
      <span key={i} className={`${styles.bubble} ${styles.shape} ${b.out ? styles.out : styles.in}`} style={{ width: `${b.width}%` }} />
    ))}
  </div>
);

/** Экран, код которого ещё грузится: фон приложения вместо пустого места. */
export const PaneSkeleton = () => <div className={styles.pane} aria-busy="true" />;

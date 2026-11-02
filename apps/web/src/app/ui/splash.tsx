import styles from "./splash.module.css";

const SHIELD = "M60 12 100 26V58C100 84 83 101 60 110 37 101 20 84 20 58V26Z";

/** Пока грузится сессия — щит Shalter с «печатающими» точками, как на заставке в index.html. */
export const Splash = () => (
  <div className={styles.splash} role="status" aria-label="Shalter">
    <svg className={styles.logo} viewBox="0 0 120 120" aria-hidden="true">
      <path className={styles.halo} d={SHIELD} />
      <path className={styles.shield} d={SHIELD} />
      <circle className={styles.dot} cx="45" cy="60" r="6" />
      <circle className={styles.dot} cx="60" cy="60" r="6" />
      <circle className={styles.dot} cx="75" cy="60" r="6" />
    </svg>
    <span className={styles.word}>Shalter</span>
  </div>
);

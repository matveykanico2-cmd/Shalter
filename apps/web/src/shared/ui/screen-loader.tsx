import styles from "./screen-loader.module.css";

/** Заглушка ленивого экрана: не даёт просвечивать предыдущему экрану, пока грузится его чанк. */
export function ScreenLoader() {
  return (
    <div className={styles.loader} role="status" aria-label="Загрузка">
      <span className={styles.spinner} aria-hidden="true" />
      <span>Загрузка…</span>
    </div>
  );
}

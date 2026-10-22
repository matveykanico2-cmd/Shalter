import styles from "./home-view.module.css";

/** Правая часть без открытого чата. */
export function HomeView() {
  return <div className={styles.empty}>Выберите чат</div>;
}

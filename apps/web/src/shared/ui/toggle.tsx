import styles from "./toggle.module.css";

/** Переключатель — как Toggle в public/js/components/toggle.js; подпись — у строки, в которой он стоит. */
export function Toggle({ checked }: { checked: boolean }) {
  return <span className={checked ? `${styles.toggle} ${styles.on}` : styles.toggle} aria-hidden />;
}

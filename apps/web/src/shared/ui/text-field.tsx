import type { ComponentProps } from "react";

import styles from "./text-field.module.css";

export function TextField({ className, ...props }: ComponentProps<"input">) {
  return <input className={className ? `${styles.input} ${className}` : styles.input} {...props} />;
}

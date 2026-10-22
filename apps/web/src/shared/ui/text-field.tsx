import type { InputHTMLAttributes } from "react";

import styles from "./text-field.module.css";

export function TextField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={className ? `${styles.input} ${className}` : styles.input} {...props} />;
}

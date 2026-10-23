import type { ButtonHTMLAttributes } from "react";

import styles from "./button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "secondary" | "link" };

const CLASS = { primary: styles.button, danger: styles.danger, secondary: styles.secondary, link: styles.link };

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  const base = CLASS[variant];
  return <button type={type} className={className ? `${base} ${className}` : base} {...props} />;
}

import type { ButtonHTMLAttributes } from "react";

import styles from "./button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "link" };

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  const base = variant === "link" ? styles.link : styles.button;
  return <button type={type} className={className ? `${base} ${className}` : base} {...props} />;
}

import { type ComponentProps, useState } from "react";

import { formatDateDigits, isoToDateText, parseDateText } from "../lib/date-text";

import { TextField } from "./text-field";

type Props = Omit<ComponentProps<"input">, "value" | "onChange"> & {
  value?: string | null;
  /** iso "" — пусто, null — дата неверна (error — почему). */
  onChange: (iso: string | null, error: string | null) => void;
};

/** Поле даты «ДД.ММ.ГГГГ» с точками по мере ввода — как DateField (public/js/components/dateField.js). */
export function DateField({ value, onChange, ...props }: Props) {
  const [text, setText] = useState(() => isoToDateText(value));
  return (
    <TextField
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="ДД.ММ.ГГГГ"
      maxLength={10}
      {...props}
      value={text}
      onChange={(e) => {
        let digits = e.target.value.replace(/\D/g, "").slice(0, 8);
        // Стёрли точку — стираем и цифру перед ней, иначе точка тут же вернётся.
        if (e.target.value.length < text.length && text.endsWith(".") && digits === text.replace(/\D/g, "")) digits = digits.slice(0, -1);
        const next = formatDateDigits(digits);
        setText(next);
        const { iso, error } = parseDateText(next);
        onChange(iso, error);
      }}
    />
  );
}

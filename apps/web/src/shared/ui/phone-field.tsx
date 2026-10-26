import { useEffect, useRef, useState } from "react";

import { type Country, countryForDigits, formatNational, guessCountry, searchCountries } from "../lib/countries";

import styles from "./phone-field.module.css";

type Props = {
  /** Начальный номер целиком («+79991234567»); сбросить поле — новый key. */
  initial?: string;
  /** Номер целиком с кодом страны или "" — пока ничего не набрано. */
  onChange?: (phone: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
};

function parse(value: string): { country: Country; national: string } {
  const digits = value.replace(/\D/g, "");
  const found = digits ? countryForDigits(digits) : undefined;
  return found ? { country: found, national: digits.slice(found.dial.length) } : { country: guessCountry(), national: digits };
}

/** Телефон с выбором страны — public/js/components/phoneField.js. */
export function PhoneField({ initial = "", onChange, onEnter, placeholder = "999 123 45 67", autoFocus }: Props) {
  const [state, setState] = useState(() => parse(initial));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { country, national } = state;

  const update = (next: { country: Country; national: string }) => {
    setState(next);
    onChange?.(next.national ? `+${next.country.dial}${next.national}` : "");
  };

  // Меню стран закрывается нажатием мимо.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (c: Country) => {
    setOpen(false);
    update({ country: c, national });
    input.current?.focus();
  };
  const found = open ? searchCountries(search) : [];

  return (
    <div ref={wrap} className={styles.field}>
      <button
        type="button"
        className={styles.countryButton}
        title="Код страны"
        onClick={() => {
          setSearch("");
          setOpen((o) => !o);
        }}
      >
        <span className={styles.flag}>{country.flag}</span>
        <span className={styles.dial}>+{country.dial}</span>
        <span className={styles.caret}>▾</span>
      </button>
      <input
        ref={input}
        className={styles.number}
        type="tel"
        autoComplete="tel"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={formatNational(national, country)}
        onChange={(e) => {
          const raw = e.target.value;
          // Вставили номер с «+» — страна по коду.
          if (raw.trim().startsWith("+")) {
            const digits = raw.replace(/\D/g, "");
            const c = countryForDigits(digits);
            if (c) return update({ country: c, national: digits.slice(c.dial.length) });
          }
          update({ country, national: raw.replace(/\D/g, "") });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
      />
      {open ? (
        <div className={styles.menu}>
          <input
            className={styles.search}
            placeholder="Страна или код"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                e.preventDefault();
                if (found[0]) pick(found[0]);
              }
            }}
          />
          <div className={styles.list}>
            {found.length ? (
              found.map((c) => (
                <button key={c.iso} type="button" className={c.iso === country.iso ? `${styles.row} ${styles.active}` : styles.row} onClick={() => pick(c)}>
                  <span className={styles.flag}>{c.flag}</span>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.dial}>+{c.dial}</span>
                </button>
              ))
            ) : (
              <p className={styles.empty}>Ничего не найдено</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

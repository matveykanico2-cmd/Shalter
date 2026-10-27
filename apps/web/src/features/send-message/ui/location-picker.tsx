import { useEffect, useRef, useState } from "react";

import type { LatLng } from "@/shared/lib/geolocation";
import { Button, Dialog } from "@/shared/ui";

import { geoByIp, geoSearch } from "../api/send-message";

import styles from "./create-dialogs.module.css";

export type PickedLocation = LatLng | "retry" | null;

type Props = { reason: string; onDone: (value: PickedLocation) => void };

const SEARCH_DELAY_MS = 450;

type Results = { kind: "idle" } | { kind: "loading" } | { kind: "found"; places: { lat: number; lng: number; name: string }[] } | { kind: "error"; text: string };

/**
 * «Геолокация», когда телефон не отдал координаты — как public/js/components/locationPicker.js:
 * примерное место по IP, поиск адреса или ещё раз GPS.
 */
export function LocationPicker({ reason, onDone }: Props) {
  const [approx, setApprox] = useState<{ lat: number; lng: number; city: string } | "failed" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ kind: "idle" });
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    geoByIp().then(
      (r) => alive && setApprox(r),
      () => alive && setApprox("failed")
    );
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, []);

  const search = async (q: string) => {
    const my = ++seq.current;
    if (q.trim().length < 3) {
      setResults({ kind: "idle" });
      return;
    }
    setResults({ kind: "loading" });
    try {
      const { places } = await geoSearch(q.trim());
      if (my === seq.current) setResults({ kind: "found", places });
    } catch (err) {
      if (my === seq.current) setResults({ kind: "error", text: err instanceof Error && err.message ? err.message : "Поиск недоступен" });
    }
  };

  const approxLabel = approx === null ? "Определяем примерное место…" : approx === "failed" ? "Примерное место определить не удалось" : `📍 Отправить примерное${approx.city ? ` — ${approx.city}` : ""}`;

  return (
    <Dialog title="Геолокация" onClose={() => onDone(null)}>
      {reason ? <p className={styles.hint}>{reason}</p> : null}
      <Button variant="secondary" disabled={!approx || approx === "failed"} onClick={() => approx && approx !== "failed" && onDone({ lat: approx.lat, lng: approx.lng })}>
        {approxLabel}
      </Button>
      <input
        className={styles.input}
        type="search"
        placeholder="Город, улица, место…"
        aria-label="Поиск места"
        enterKeyHint="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          clearTimeout(timer.current);
          const q = e.target.value;
          timer.current = setTimeout(() => void search(q), SEARCH_DELAY_MS);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          clearTimeout(timer.current);
          void search(query);
        }}
      />
      {results.kind === "loading" ? <p className={styles.hint}>Ищем…</p> : null}
      {results.kind === "error" ? <p className={styles.hint}>{results.text}</p> : null}
      {results.kind === "found" ? (
        results.places.length ? (
          <div className={styles.places}>
            {results.places.map((p) => (
              <button key={`${p.lat},${p.lng},${p.name}`} type="button" className={styles.place} onClick={() => onDone({ lat: p.lat, lng: p.lng })}>
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.hint}>Ничего не нашлось</p>
        )
      ) : null}
      <Button variant="secondary" onClick={() => onDone("retry")}>
        Попробовать GPS ещё раз
      </Button>
      <Button variant="secondary" onClick={() => onDone(null)}>
        Отмена
      </Button>
    </Dialog>
  );
}

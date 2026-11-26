"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Kept as an empty prefix for normal server deployments. */
export const BASE_PATH = "";

const PHONE_QUERY = "(max-width: 767px)";
/** True on phone-sized screens (below Tailwind's md breakpoint); false during server render. */
export function useIsPhone() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = matchMedia(PHONE_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** fetch() wrapper for our API: sends JSON or FormData, parses JSON, throws ApiError on failure. */
export async function api<T = { ok: true }>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/accounts")) {
      window.location.replace(`${BASE_PATH}/accounts/login`);
    }
    throw new ApiError(res.status, (data as { error?: string }).error ?? "Something went wrong.");
  }
  return data as T;
}

/** Loads an API URL and keeps the result in state. Pass null to skip loading. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    api<T>(url)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, setData, error, loading: !!url && data === null && error === null, reload };
}

/** Instagram-style short relative time: "now", "5m", "3h", "2d", "4w", or a date. */
export function timeAgo(ts: number, long = false) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const units: [number, string, string][] = [
    [60 * 60 * 24 * 7, "w", "week"],
    [60 * 60 * 24, "d", "day"],
    [60 * 60, "h", "hour"],
    [60, "m", "minute"],
  ];
  if (s < 60) return long ? "Just now" : "now";
  if (s < 60 * 60 * 24 * 7 * 8) {
    for (const [size, short, word] of units) {
      if (s >= size) {
        const n = Math.floor(s / size);
        return long ? `${n} ${word}${n === 1 ? "" : "s"} ago` : `${n}${short}`;
      }
    }
  }
  return new Date(ts).toLocaleDateString(undefined, { month: long ? "long" : "short", day: "numeric", year: "numeric" });
}

/** 1234 -> "1,234", 15300 -> "15.3K", 2100000 -> "2.1M" */
export function compact(n: number) {
  if (n < 10_000) return n.toLocaleString("en-US");
  if (n < 1_000_000) return `${+(n / 1000).toFixed(1)}K`;
  return `${+(n / 1_000_000).toFixed(1)}M`;
}

export const plural = (n: number, word: string) => `${compact(n)} ${word}${n === 1 ? "" : "s"}`;

/** Runs `fn` whenever a new post or story is shared from the Create dialog. */
export function useOnCreated(fn: () => void) {
  useEffect(() => {
    window.addEventListener("snapgram:created", fn);
    return () => window.removeEventListener("snapgram:created", fn);
  }, [fn]);
}

/** Groups items into Instagram's notification buckets. */
export function timeBucket(ts: number) {
  const d = Date.now() - ts;
  const day = 86_400_000;
  if (d < day) return "Today";
  if (d < 2 * day) return "Yesterday";
  if (d < 7 * day) return "This week";
  if (d < 30 * day) return "This month";
  return "Earlier";
}

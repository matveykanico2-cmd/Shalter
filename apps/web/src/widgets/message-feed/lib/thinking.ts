/** Секунд с момента start (в секундах эпохи); secondsSince(0) — «сейчас» для отсчёта. */
export const secondsSince = (start: number, now = Date.now()) => Math.floor(now / 1000) - start;

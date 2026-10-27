/** Таймер разговора: 00:42, 12:05. */
export const formatElapsed = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

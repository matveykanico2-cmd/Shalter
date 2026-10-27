// Форматирование чисел админки — formatUptime/formatBytes в public/js/views/settings/index.js.

export function formatUptime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  if (m) return `${m} мин ${s % 60} с`;
  return `${s} с`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`;
  if (bytes < 1024 ** 5) return `${(bytes / 1024 ** 4).toFixed(2)} ТБ`;
  return `${(bytes / 1024 ** 5).toFixed(2)} ПБ`;
}

export const dateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU");

export const fmtNumber = (n: number | null | undefined) => new Intl.NumberFormat("ru-RU").format(n ?? 0);

/** Скачать JSON файлом — выгрузка данных пользователя. */
export function downloadJson(data: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

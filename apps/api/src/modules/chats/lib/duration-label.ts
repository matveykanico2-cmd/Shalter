// Срок в секундах словами для строк в ленте: «1 неделя», «2 ч», «30 мин».
export function durationLabel(sec: number): string {
  if (sec % 86400 === 0) {
    const d = sec / 86400;
    return d === 7 ? "1 неделя" : d === 30 || d === 31 ? "1 месяц" : `${d} дн.`;
  }
  if (sec % 3600 === 0) return `${sec / 3600} ч`;
  if (sec % 60 === 0) return `${sec / 60} мин`;
  return `${sec} с`;
}

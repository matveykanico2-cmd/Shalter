/** Быстрый профиль устройства без UA sniffing: используется только для выбора
 * безопасных оптимизаций первого экрана. Функциональность приложения не меняет. */
export function isLowEndDevice() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return connection?.saveData === true || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? "") || (memory != null && memory <= 3) || (cores != null && cores <= 4);
}

export function markDeviceProfile() {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute("data-low-end", isLowEndDevice());
}

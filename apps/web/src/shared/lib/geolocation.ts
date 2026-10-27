// Координаты устройства — как getPosition в public/js/components/composer.js: сначала точно
// (GPS), не успел — по сети; в помещении GPS ловит долго, и запрос не должен просто падать.

export type LatLng = { lat: number; lng: number };

const ERRORS: Record<number, string> = {
  1: "Нет доступа к геолокации — разрешите её Shalter в настройках телефона или браузера",
  3: "Не удалось определить местоположение вовремя — включите GPS и попробуйте ещё раз",
};
const FALLBACK = "Не удалось получить местоположение — проверьте, включена ли геолокация на устройстве";

export function getPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    const geo = navigator.geolocation;
    if (!geo) return reject(new Error("Геолокация не поддерживается на этом устройстве"));
    if (!window.isSecureContext) return reject(new Error("Геолокация работает только по HTTPS"));
    const ok = (pos: GeolocationPosition) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    const fail = (err: GeolocationPositionError) => reject(new Error(ERRORS[err?.code] ?? FALLBACK));
    geo.getCurrentPosition(
      ok,
      (err) => {
        if (err?.code === 1) return fail(err);
        geo.getCurrentPosition(ok, fail, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

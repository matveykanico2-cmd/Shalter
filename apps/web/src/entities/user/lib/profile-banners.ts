// Баннер в шапке профиля — public/js/lib/profileBanners.js: встроенные фоны (градиенты и узоры,
// без картинок — грузятся мгновенно) или своё фото ({ id: "custom", url }).
export const PROFILE_BANNERS = [
  { id: "sunset", label: "Закат", css: "linear-gradient(135deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%)" },
  { id: "ocean", label: "Океан", css: "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)" },
  { id: "aurora", label: "Сияние", css: "linear-gradient(135deg, #00c9a7 0%, #845ec2 60%, #2c73d2 100%)" },
  { id: "peach", label: "Персик", css: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)" },
  { id: "night", label: "Ночь", css: "radial-gradient(circle at 20% 30%, rgba(255,255,255,.35) 0 1px, transparent 2px) 0 0/38px 38px, radial-gradient(circle at 70% 60%, rgba(255,255,255,.25) 0 1px, transparent 2px) 0 0/52px 52px, linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
  { id: "lavender", label: "Лаванда", css: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" },
  { id: "forest", label: "Лес", css: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)" },
  { id: "fire", label: "Огонь", css: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)" },
  { id: "mint", label: "Мята", css: "linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)" },
  { id: "space", label: "Космос", css: "radial-gradient(ellipse at 30% 20%, #6a3093 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, #1e3c72 0%, transparent 55%), #0b0b1e" },
  { id: "dots", label: "Точки", css: "radial-gradient(rgba(255,255,255,.35) 1.5px, transparent 1.6px) 0 0/16px 16px, linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" },
  { id: "stripes", label: "Полосы", css: "repeating-linear-gradient(45deg, rgba(255,255,255,.14) 0 12px, transparent 12px 24px), linear-gradient(135deg, #fa709a 0%, #fee140 100%)" },
  { id: "waves", label: "Волны", css: "radial-gradient(circle at 50% 120%, rgba(255,255,255,.25) 20%, transparent 21%) 0 0/60px 30px, linear-gradient(180deg, #43cea2 0%, #185a9d 100%)" },
  { id: "graphite", label: "Графит", css: "linear-gradient(135deg, #434343 0%, #000000 100%)" },
  { id: "candy", label: "Конфета", css: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
  { id: "sky", label: "Небо", css: "linear-gradient(180deg, #89f7fe 0%, #66a6ff 100%)" },
];

/** CSS-фон для баннера пользователя или null, если баннера нет. */
export function bannerBackground(banner: unknown) {
  const b = banner as { id?: string; url?: string } | null | undefined;
  if (!b?.id) return null;
  if (b.id === "custom") return b.url ? `center / cover no-repeat url("${String(b.url).replace(/"/g, "")}")` : null;
  return PROFILE_BANNERS.find((x) => x.id === b.id)?.css ?? null;
}

// Цены, которые админ меняет из Настройки → Цены, без деплоя: тарифы Premium
// и бизнеса, наборы звёзд, кабинет рекламы, курс звёзд для оплаты Premium и
// стоимость платных действий за звёзды. Хранятся одной записью в app_config;
// пока админ ничего не менял — действуют значения по умолчанию ниже.
const db = require("../db");

const KEY = "pricing";

const DEFAULTS = {
  premiumPlans: [
    { id: "1m", days: 30, priceRub: 99, label: "1 месяц" },
    { id: "3m", days: 90, priceRub: 249, label: "3 месяца" },
    { id: "6m", days: 180, priceRub: 449, label: "6 месяцев" },
    { id: "12m", days: 365, priceRub: 799, label: "12 месяцев" },
  ],
  businessPlans: [
    { id: "1m", days: 30, priceRub: 299, label: "1 месяц" },
    { id: "3m", days: 90, priceRub: 799, label: "3 месяца" },
    { id: "6m", days: 180, priceRub: 1499, label: "6 месяцев" },
    { id: "12m", days: 365, priceRub: 2499, label: "12 месяцев" },
  ],
  starPacks: [
    { id: "stars_50", stars: 50, priceRub: 100 },
    { id: "stars_100", stars: 100, priceRub: 200 },
    { id: "stars_250", stars: 250, priceRub: 500 },
    { id: "stars_500", stars: 500, priceRub: 1000 },
    { id: "stars_1000", stars: 1000, priceRub: 2000 },
    { id: "stars_2500", stars: 2500, priceRub: 5000 },
  ],
  ads: { priceRub: 20, days: 30 },
  rubPerStar: 2,
  starCosts: { boost: 10, delete: 5 },
};

const MAX_ITEMS = 12;
const MAX_RUB = 1_000_000;
const MAX_DAYS = 3650;
const MAX_STARS = 1_000_000;

function intIn(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function cleanId(value, fallback) {
  const id = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  // Чисто цифровой ключ JS переставит в начало объекта (plansAsMap) — порядок
  // тарифов у клиента поехал бы.
  if (/^\d+$/.test(id)) return `p${id}`;
  return id || fallback;
}

// Каждая функция ниже возвращает либо { value }, либо { error } — админу
// показывается первая же ошибка, и ничего не сохраняется.
function cleanPlans(list, title) {
  if (!Array.isArray(list) || !list.length) return { error: `${title}: нужен хотя бы один тариф` };
  if (list.length > MAX_ITEMS) return { error: `${title}: не больше ${MAX_ITEMS} тарифов` };
  const out = [];
  const seen = new Set();
  for (const [i, p] of list.entries()) {
    const days = intIn(p?.days, 1, MAX_DAYS);
    const priceRub = intIn(p?.priceRub, 1, MAX_RUB);
    const label = String(p?.label ?? "").trim().slice(0, 40);
    if (!days) return { error: `${title}: срок должен быть от 1 до ${MAX_DAYS} дней` };
    if (!priceRub) return { error: `${title}: цена должна быть целым числом от 1 до ${MAX_RUB} ₽` };
    if (!label) return { error: `${title}: укажите название тарифа` };
    let id = cleanId(p?.id, `p${days}d`);
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    out.push({ id, days, priceRub, label });
  }
  return { value: out };
}

function cleanPacks(list) {
  if (!Array.isArray(list) || !list.length) return { error: "Звёзды: нужен хотя бы один набор" };
  if (list.length > MAX_ITEMS) return { error: `Звёзды: не больше ${MAX_ITEMS} наборов` };
  const out = [];
  const seen = new Set();
  for (const [i, p] of list.entries()) {
    const stars = intIn(p?.stars, 1, MAX_STARS);
    const priceRub = intIn(p?.priceRub, 1, MAX_RUB);
    if (!stars) return { error: `Звёзды: количество должно быть от 1 до ${MAX_STARS}` };
    if (!priceRub) return { error: `Звёзды: цена должна быть целым числом от 1 до ${MAX_RUB} ₽` };
    let id = cleanId(p?.id, `stars_${stars}`);
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    out.push({ id, stars, priceRub });
  }
  out.sort((a, b) => a.stars - b.stars);
  return { value: out };
}

function read() {
  const row = db.prepare("SELECT data FROM app_config WHERE key = ?").get(KEY);
  if (!row) return {};
  try {
    return JSON.parse(row.data) ?? {};
  } catch {
    return {};
  }
}

function getPricing() {
  const saved = read();
  return {
    premiumPlans: saved.premiumPlans ?? DEFAULTS.premiumPlans,
    businessPlans: saved.businessPlans ?? DEFAULTS.businessPlans,
    starPacks: saved.starPacks ?? DEFAULTS.starPacks,
    ads: { ...DEFAULTS.ads, ...saved.ads },
    rubPerStar: saved.rubPerStar ?? DEFAULTS.rubPerStar,
    starCosts: { ...DEFAULTS.starCosts, ...saved.starCosts },
  };
}

// Принимает любое подмножество полей getPricing(); остальное не трогает.
function updatePricing(patch) {
  const next = { ...read() };
  if (patch.premiumPlans !== undefined) {
    const r = cleanPlans(patch.premiumPlans, "Premium");
    if (r.error) return r;
    next.premiumPlans = r.value;
  }
  if (patch.businessPlans !== undefined) {
    const r = cleanPlans(patch.businessPlans, "Бизнес");
    if (r.error) return r;
    next.businessPlans = r.value;
  }
  if (patch.starPacks !== undefined) {
    const r = cleanPacks(patch.starPacks);
    if (r.error) return r;
    next.starPacks = r.value;
  }
  if (patch.ads !== undefined) {
    const priceRub = intIn(patch.ads?.priceRub, 1, MAX_RUB);
    const days = intIn(patch.ads?.days, 1, MAX_DAYS);
    if (!priceRub || !days) return { error: "Реклама: цена от 1 ₽ и срок от 1 до 3650 дней" };
    next.ads = { priceRub, days };
  }
  if (patch.rubPerStar !== undefined) {
    const rate = Number(patch.rubPerStar);
    if (!Number.isFinite(rate) || rate < 0.01 || rate > 1000) return { error: "Курс: от 0.01 до 1000 ₽ за звезду" };
    next.rubPerStar = Math.round(rate * 100) / 100;
  }
  if (patch.starCosts !== undefined) {
    const boost = intIn(patch.starCosts?.boost, 0, MAX_STARS);
    const del = intIn(patch.starCosts?.delete, 0, MAX_STARS);
    if (boost === null || del === null) return { error: "Платные действия: целое число звёзд от 0" };
    next.starCosts = { boost, delete: del };
  }
  db.prepare("INSERT INTO app_config (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data").run(
    KEY,
    JSON.stringify(next)
  );
  return { value: getPricing() };
}

function resetPricing() {
  db.prepare("DELETE FROM app_config WHERE key = ?").run(KEY);
  return getPricing();
}

// Тариф по id, а если такого нет (устарел или не передан) — первый.
function pickPlan(plans, id) {
  return plans.find((p) => p.id === id) ?? plans[0];
}

function getPremiumPlan(id) {
  return pickPlan(getPricing().premiumPlans, id);
}

function getBusinessPlan(id) {
  return pickPlan(getPricing().businessPlans, id);
}

function getStarPack(id) {
  return getPricing().starPacks.find((p) => p.id === id) ?? null;
}

function starsCostFor(plan) {
  return Math.ceil(plan.priceRub / getPricing().rubPerStar);
}

// Старый формат ответа клиенту: { "1m": { days, priceRub, label }, ... } —
// клиент перебирает Object.entries и шлёт ключ обратно.
function plansAsMap(plans, extra) {
  const out = {};
  for (const p of plans) out[p.id] = { days: p.days, priceRub: p.priceRub, label: p.label, ...(extra ? extra(p) : {}) };
  return out;
}

module.exports = {
  DEFAULTS,
  getPricing,
  updatePricing,
  resetPricing,
  getPremiumPlan,
  getBusinessPlan,
  getStarPack,
  starsCostFor,
  plansAsMap,
};

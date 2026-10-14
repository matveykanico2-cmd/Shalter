const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");

// Запасной путь для «Геолокации», когда телефон не отдаёт координаты (нет
// разрешения, выключен GPS, старая сборка приложения): примерное место по IP
// и поиск адреса через OpenStreetMap. Оба сервиса бесплатны и без ключа.
const router = express.Router();
router.use(requireUserId);

const UA = { "User-Agent": "Shalter/1.0 (https://shalter.ru)" };

async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isPrivateIp(ip) {
  return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);
}

router.get(
  "/ip",
  asyncRoute(async (req, res) => {
    const ip = String(req.ip || "").replace(/^::ffff:/, "");
    const path = isPrivateIp(ip) ? "" : `/${encodeURIComponent(ip)}`;
    const providers = [
      async () => {
        const d = await getJson(`https://ipwho.is${path || "/"}?lang=ru`);
        if (d.success === false) throw new Error(d.message || "ipwho failed");
        return { lat: Number(d.latitude), lng: Number(d.longitude), city: d.city || d.region || d.country || "" };
      },
      async () => {
        const d = await getJson(`https://get.geojs.io/v1/ip/geo${path}.json`);
        return { lat: Number(d.latitude), lng: Number(d.longitude), city: d.city || d.region || d.country || "" };
      },
    ];
    for (const p of providers) {
      try {
        const r = await p();
        if (Number.isFinite(r.lat) && Number.isFinite(r.lng) && (r.lat || r.lng)) return res.json(r);
      } catch {}
    }
    res.status(503).json({ error: "Не удалось определить местоположение по сети" });
  })
);

router.get(
  "/search",
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? "").trim().slice(0, 200);
    if (!q) return res.json({ places: [] });
    try {
      const list = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ru&q=${encodeURIComponent(q)}`);
      res.json({
        places: (Array.isArray(list) ? list : [])
          .map((p) => ({ lat: Number(p.lat), lng: Number(p.lon), name: p.display_name || "" }))
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
      });
    } catch {
      res.status(503).json({ error: "Поиск адресов сейчас недоступен" });
    }
  })
);

module.exports = router;

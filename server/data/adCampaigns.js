const db = require("../db");

// Кампании рекламного кабинета. Правила — в server/routes/ads.js, здесь только
// хранение и счёт.

const CPM_MIN = 5; // звёзд за тысячу показов — ниже этого показ дешевле округления

function rowToCampaign(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    text: row.text,
    url: row.url ?? null,
    imageUrl: row.imageUrl ?? null,
    placement: row.placement,
    status: row.status,
    rejectReason: row.rejectReason ?? null,
    budgetStars: row.budgetStars,
    spentStars: row.spentStars,
    cpmStars: row.cpmStars,
    impressions: row.impressions,
    clicks: row.clicks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? null,
    // Считается здесь, а не в интерфейсе: одно и то же число нужно и кабинету,
    // и решению «показывать ли ещё».
    remainingStars: Math.max(0, row.budgetStars - row.spentStars),
  };
}

function listByOwner(ownerId) {
  return db.prepare("SELECT * FROM ad_campaigns WHERE ownerId = ? ORDER BY createdAt DESC").all(ownerId).map(rowToCampaign);
}

function get(id) {
  return rowToCampaign(db.prepare("SELECT * FROM ad_campaigns WHERE id = ?").get(id));
}

function listForReview() {
  return db.prepare("SELECT * FROM ad_campaigns WHERE status = 'review' ORDER BY createdAt ASC").all().map(rowToCampaign);
}

// Кандидаты на показ: идут, деньги не кончились, место совпадает. Порядок
// случайный, чтобы одна кампания не занимала всю выдачу просто потому, что
// создана раньше.
function pickForPlacement(placement, excludeOwnerId) {
  const rows = db
    .prepare(
      `SELECT * FROM ad_campaigns
        WHERE status = 'active' AND placement = ? AND budgetStars > spentStars
          AND (? IS NULL OR ownerId <> ?)
        ORDER BY RANDOM() LIMIT 1`
    )
    .get(placement, excludeOwnerId ?? null, excludeOwnerId ?? null);
  return rowToCampaign(rows);
}

// Новая кампания сразу встаёт в очередь на проверку, а не ложится черновиком:
// объявление всё равно нельзя показать без проверки, а «создал и жду» — это
// ровно то состояние, в котором она оказывается сразу после создания. Статус
// всё же параметр: правка уже проверенного объявления возвращает его сюда же.
function create({ ownerId, title, text, url, imageUrl, placement, cpmStars, status = "review" }) {
  const id = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    `INSERT INTO ad_campaigns (id, ownerId, title, text, url, imageUrl, placement, status, cpmStars, createdAt)
     VALUES (@id, @ownerId, @title, @text, @url, @imageUrl, @placement, @status, @cpmStars, @createdAt)`
  ).run({
    id,
    status,
    ownerId,
    title: title || "Без названия",
    text: text || "",
    url: url || null,
    imageUrl: imageUrl || null,
    placement: placement || "discover",
    cpmStars: Math.max(CPM_MIN, Number(cpmStars) || 20),
    createdAt: new Date().toISOString(),
  });
  return get(id);
}

function update(id, patch) {
  const allowed = ["title", "text", "url", "imageUrl", "placement", "status", "rejectReason", "budgetStars", "cpmStars"];
  const fields = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!fields.length) return get(id);
  const set = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE ad_campaigns SET ${set}, updatedAt = @updatedAt WHERE id = @id`).run({
    ...Object.fromEntries(fields.map((f) => [f, patch[f]])),
    id,
    updatedAt: new Date().toISOString(),
  });
  return get(id);
}

function remove(id) {
  db.prepare("DELETE FROM ad_campaigns WHERE id = ?").run(id);
}

// Показ. Списывать по звезде за показ нельзя — цена за тысячу меньше единицы,
// поэтому платное «зерно» копится в spentStars дробями через накопитель: сумма
// растёт на cpm/1000 и списывается целыми звёздами, когда наберётся.
const recordImpression = db.transaction((id, cpmStars) => {
  const day = new Date().toISOString().slice(0, 10);
  const row = db.prepare("SELECT impressions, spentStars, budgetStars, cpmStars FROM ad_campaigns WHERE id = ?").get(id);
  if (!row) return null;
  const impressions = row.impressions + 1;
  // Сколько всего должно быть списано при таком числе показов — так на длинной
  // дистанции округление не уводит счёт ни в плюс, ни в минус.
  const due = Math.floor((impressions * (cpmStars ?? row.cpmStars)) / 1000);
  const spent = Math.min(row.budgetStars, Math.max(row.spentStars, due));
  const charged = spent - row.spentStars;
  db.prepare("UPDATE ad_campaigns SET impressions = ?, spentStars = ? WHERE id = ?").run(impressions, spent, id);
  db.prepare(
    `INSERT INTO ad_daily (campaignId, day, impressions, spentStars) VALUES (?, ?, 1, ?)
     ON CONFLICT(campaignId, day) DO UPDATE SET impressions = impressions + 1, spentStars = spentStars + ?`
  ).run(id, day, charged, charged);
  // Деньги кончились — кампания сама останавливается, а не крутится в минус.
  if (spent >= row.budgetStars) db.prepare("UPDATE ad_campaigns SET status = 'finished' WHERE id = ? AND status = 'active'").run(id);
  return charged;
});

const recordClick = db.transaction((id) => {
  const day = new Date().toISOString().slice(0, 10);
  db.prepare("UPDATE ad_campaigns SET clicks = clicks + 1 WHERE id = ?").run(id);
  db.prepare(
    `INSERT INTO ad_daily (campaignId, day, clicks) VALUES (?, ?, 1)
     ON CONFLICT(campaignId, day) DO UPDATE SET clicks = clicks + 1`
  ).run(id, day);
});

function daily(campaignId, days = 14) {
  return db
    .prepare("SELECT * FROM ad_daily WHERE campaignId = ? ORDER BY day DESC LIMIT ?")
    .all(campaignId, days)
    .reverse();
}

module.exports = { CPM_MIN, listByOwner, get, listForReview, pickForPlacement, create, update, remove, recordImpression, recordClick, daily };

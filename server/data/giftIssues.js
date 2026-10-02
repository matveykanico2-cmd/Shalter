const db = require("../db");

function issuedCount(giftId) {
  const row = db.prepare("SELECT MAX(serial) AS maxSerial FROM gift_issues WHERE giftId = ?").get(giftId);
  return row?.maxSerial ?? 0;
}

function remaining(gift) {
  if (!gift?.supply) return null;
  return Math.max(0, gift.supply - issuedCount(gift.id));
}

const claimSerial = db.transaction((gift, recipientId, fromId) => {
  const alreadyIssued = issuedCount(gift.id);
  if (alreadyIssued >= gift.supply) return null;
  const serial = alreadyIssued + 1;
  db.prepare(
    `INSERT INTO gift_issues (id, giftId, serial, recipientId, fromId, issuedAt)
     VALUES (@id, @giftId, @serial, @recipientId, @fromId, @issuedAt)`
  ).run({
    id: `gi_${Date.now()}_${gift.id}_${serial}`,
    giftId: gift.id,
    serial,
    recipientId,
    fromId: fromId ?? null,
    issuedAt: new Date().toISOString(),
  });
  return serial;
});

function listIssues(giftId) {
  return db.prepare("SELECT * FROM gift_issues WHERE giftId = ? ORDER BY serial ASC").all(giftId);
}

module.exports = { issuedCount, remaining, claimSerial, listIssues };

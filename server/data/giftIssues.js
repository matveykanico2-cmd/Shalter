const db = require("../db");

// Serial-number bookkeeping for limited gifts (server/data/gifts.js's
// entries with a `supply`). Unlimited gifts never touch this table at all —
// they have nothing to run out of.

// How many copies have ever been handed out. Deliberately MAX(serial), not
// COUNT(*): serials must never be reused, so even if a row were ever removed
// the next copy still gets a fresh number rather than quietly reissuing
// someone else's "#3".
function issuedCount(giftId) {
  const row = db.prepare("SELECT MAX(serial) AS maxSerial FROM gift_issues WHERE giftId = ?").get(giftId);
  return row?.maxSerial ?? 0;
}

function remaining(gift) {
  if (!gift?.supply) return null; // unlimited — nothing to count down
  return Math.max(0, gift.supply - issuedCount(gift.id));
}

// Claims the next serial for one copy, or returns null if the last one is
// already gone. Wrapped in a transaction so the count-then-insert can't
// interleave with another buyer's between the two statements — without it,
// two people paying for the last copy at the same moment would both read
// "9 issued of 10" and both be handed #10.
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

// Every issued copy of every limited gift, newest first — powers the
// "кто владеет" list if that's ever surfaced; also handy for the admin to
// audit who holds what.
function listIssues(giftId) {
  return db.prepare("SELECT * FROM gift_issues WHERE giftId = ? ORDER BY serial ASC").all(giftId);
}

module.exports = { issuedCount, remaining, claimSerial, listIssues };

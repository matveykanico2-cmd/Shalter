const db = require("../db");

// Очередь фоновой работы. Разбирает её один исполнитель — фоновый процесс
// (apps/api/dist/worker.js), поэтому «взятая» задача просто помечается lockedAt, а при его
// запуске все отметки снимаются: задачи, прерванные перезапуском, выполнятся снова.

function enqueueJob(kind, payload, { delayMs = 0 } = {}) {
  const now = Date.now();
  db.prepare("INSERT INTO background_jobs (kind, payload, runAt, createdAt) VALUES (?, ?, ?, ?)").run(
    kind,
    JSON.stringify(payload ?? {}),
    now + delayMs,
    now
  );
}

function claimJob(now = Date.now()) {
  const row = db
    .prepare(
      `UPDATE background_jobs SET lockedAt = ?, attempts = attempts + 1
       WHERE id = (SELECT id FROM background_jobs WHERE lockedAt IS NULL AND runAt <= ? ORDER BY runAt, id LIMIT 1)
       RETURNING id, kind, payload, attempts`
    )
    .get(now, now);
  return row ? { ...row, payload: JSON.parse(row.payload) } : null;
}

function finishJob(id) {
  db.prepare("DELETE FROM background_jobs WHERE id = ?").run(id);
}

function retryJob(id, delayMs) {
  db.prepare("UPDATE background_jobs SET lockedAt = NULL, runAt = ? WHERE id = ?").run(Date.now() + delayMs, id);
}

function releaseAllJobs() {
  db.prepare("UPDATE background_jobs SET lockedAt = NULL WHERE lockedAt IS NOT NULL").run();
}

function countJobs() {
  return db.prepare("SELECT count(*) AS n FROM background_jobs").get().n;
}

module.exports = { enqueueJob, claimJob, finishJob, retryJob, releaseAllJobs, countJobs };

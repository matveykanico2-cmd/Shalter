const db = require("../db");

function listAllReports() {
  return db.prepare("SELECT * FROM reports").all();
}

async function getReport(id) {
  return db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
}

async function addReport(report) {
  db.prepare(
    `INSERT INTO reports (id, reporterId, targetType, targetId, reason, details, createdAt, status)
     VALUES (@id, @reporterId, @targetType, @targetId, @reason, @details, @createdAt, @status)`
  ).run(report);
  return report;
}

// "open" -> "resolved_deleted" | "resolved_banned" | "dismissed", set once
// (routes/reports.js's /:id/resolve re-checks status !== "open" before
// calling this, so there's no separate guard needed here).
async function setReportStatus(id, status) {
  db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(status, id);
}

module.exports = { listAllReports, getReport, addReport, setReportStatus };

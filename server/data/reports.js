const db = require("../db");

function listAllReports() {
  return db.prepare("SELECT * FROM reports").all();
}

// Newest first, and only what still needs a decision — what the admin's
// moderation screen actually opens onto (server/routes/admin.js).
function listOpenReports(limit = 200) {
  return db.prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY createdAt DESC LIMIT ?").all(limit);
}

// Everything ever filed against one account, resolved or not — this is the
// "посмотреть причину" half of reviewing a ban: before lifting one, the admin
// sees the reports that led to it rather than a bare flag. Uses the
// subjectUserId stamped at report time (see server/db.js), so it still works
// after the reported message or chat has been deleted.
function listReportsAboutUser(userId) {
  return db.prepare("SELECT * FROM reports WHERE subjectUserId = ? ORDER BY createdAt DESC LIMIT 100").all(userId);
}

async function getReport(id) {
  return db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
}

async function addReport(report) {
  db.prepare(
    `INSERT INTO reports (id, reporterId, targetType, targetId, subjectUserId, reason, details, createdAt, status)
     VALUES (@id, @reporterId, @targetType, @targetId, @subjectUserId, @reason, @details, @createdAt, @status)`
  ).run(report);
  return report;
}

// "open" -> "resolved_deleted" | "resolved_banned" | "dismissed", set once
// (routes/reports.js's /:id/resolve re-checks status !== "open" before
// calling this, so there's no separate guard needed here).
async function setReportStatus(id, status) {
  db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(status, id);
}

module.exports = {
  listAllReports,
  listOpenReports,
  listReportsAboutUser,
  getReport,
  addReport,
  setReportStatus,
};

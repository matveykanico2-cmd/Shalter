const db = require("../db");

function listAllReports() {
  return db.prepare("SELECT * FROM reports").all();
}

function listOpenReports(limit = 200) {
  return db.prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY createdAt DESC LIMIT ?").all(limit);
}

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

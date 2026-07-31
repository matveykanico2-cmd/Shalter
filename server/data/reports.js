const db = require("../db");

function listAllReports() {
  return db.prepare("SELECT * FROM reports").all();
}

async function addReport(report) {
  db.prepare(
    `INSERT INTO reports (id, reporterId, targetType, targetId, reason, details, createdAt, status)
     VALUES (@id, @reporterId, @targetType, @targetId, @reason, @details, @createdAt, @status)`
  ).run(report);
  return report;
}

module.exports = { listAllReports, addReport };

const { readCollection, updateCollection } = require("./store");

const FILE = "reports";

function listAllReports() {
  return readCollection(FILE);
}

async function addReport(report) {
  await updateCollection(FILE, (reports) => [...reports, report]);
  return report;
}

module.exports = { listAllReports, addReport };

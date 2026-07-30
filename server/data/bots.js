const { readCollection } = require("./store");

const FILE = "bots";

function listBots() {
  return readCollection(FILE);
}

async function getBotByUserId(userId) {
  const bots = await listBots();
  return bots.find((b) => b.userId === userId);
}

module.exports = { listBots, getBotByUserId };

const crypto = require("crypto");

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`;
}

module.exports = { genId };

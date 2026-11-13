// Шифрование временных частей при загрузке частями (apps/api, modules/uploads,
// UploadSessionsService): AES-256-CTR с произвольного байта потока. Счётчик IV сдвигается на
// offset/16 блоков, остаток блока проматывается — части шифруются по отдельности и стыкуются в
// один шифротекст, который расшифровывается целиком с offset 0. Ключ сессии живёт только в
// памяти процесса: на диске — ни одного открытого байта. Шифрование файлов — здесь, в server/,
// как и fileCrypto.js (AGENTS.md: до удаления server/ его не переносят в TS).
const crypto = require("crypto");

function partCipherAt(key, iv, offset, mode = "cipher") {
  const counter = Buffer.from(iv);
  let carry = BigInt(Math.floor(offset / 16));
  for (let i = 15; i >= 0 && carry > 0n; i--) {
    const sum = BigInt(counter[i]) + (carry & 0xffn);
    counter[i] = Number(sum & 0xffn);
    carry = (carry >> 8n) + (sum >> 8n);
  }
  const stream = mode === "cipher" ? crypto.createCipheriv("aes-256-ctr", key, counter) : crypto.createDecipheriv("aes-256-ctr", key, counter);
  const skip = offset % 16;
  if (skip) stream.update(Buffer.alloc(skip));
  return stream;
}

/** Новый ключ и IV сессии. */
function newPartKey() {
  return { key: crypto.randomBytes(32), iv: crypto.randomBytes(16) };
}

module.exports = { partCipherAt, newPartKey };

const zlib = require("zlib");

const MAGIC = Buffer.from("SHCM1");

function qualityFor(sizeHint) {
  if (!Number.isFinite(sizeHint) || sizeHint <= 0) return 5;
  const MB = 1024 * 1024;
  if (sizeHint <= 2 * MB) return 9;
  if (sizeHint <= 20 * MB) return 6;
  if (sizeHint <= 100 * MB) return 4;
  return 2;
}

function compressStream(sizeHint) {
  return zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: qualityFor(sizeHint) } });
}

function decompressStream() {
  return zlib.createBrotliDecompress();
}

module.exports = { MAGIC, compressStream, decompressStream };

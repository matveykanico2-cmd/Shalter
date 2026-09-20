const zlib = require("zlib");

// Storage-side compression for plain file attachments only — never
// image/video/voice/video-note/avatar/gift (routes/uploads.js only calls
// this for kind === "file"). Those already carry their own compressed
// format (JPEG/H.264/etc — a second pass gains ~nothing) and, more
// importantly, rely on serveUpload.js's byte-range reads for
// seeking/resuming; brotli output can't be decompressed starting from an
// arbitrary byte offset the way AES-CTR can be decrypted from one, so a
// compressed file can only ever be served whole, not ranged. Fine for a
// document; would silently break video scrubbing.
//
// MAGIC is written as the first bytes of the *plaintext* (before
// encryption, inside what fileCrypto.js's cipher sees) — it's how
// serveUpload.js later tells "this content is brotli-compressed" apart
// from every other upload, which never has this prefix. Five bytes chosen
// to make a false-positive match against unrelated file content practically
// impossible.
const MAGIC = Buffer.from("SHCM1");

// Quality 11 (brotli's max) is worth its cost for a typical document — but
// "file" uploads go up to 5 GB (uploadLimits.js), and quality 11 on
// something that large isn't "a bit slower", it's minutes of single-threaded
// CPU time the upload request just sits blocked on. Brotli's own docs are
// explicit that quality should scale down with input size for exactly this
// reason; this picks a level from the declared upload size (a hint from
// Content-Length — routes/uploads.js already treats it as advisory, not
// trusted, and being wrong here only costs compression ratio, never
// correctness) rather than paying max-quality cost on something it'll never
// pay back.
function qualityFor(sizeHint) {
  if (!Number.isFinite(sizeHint) || sizeHint <= 0) return 7; // unknown size — a moderate default, not an assumption either way
  const MB = 1024 * 1024;
  if (sizeHint <= 2 * MB) return 11;
  if (sizeHint <= 20 * MB) return 9;
  if (sizeHint <= 100 * MB) return 6;
  return 4;
}

function compressStream(sizeHint) {
  return zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: qualityFor(sizeHint) } });
}

function decompressStream() {
  return zlib.createBrotliDecompress();
}

module.exports = { MAGIC, compressStream, decompressStream };

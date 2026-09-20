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

// Quality 11 = brotli's max compression level. Worth paying for here: file
// uploads (documents/code/text — the kind this is limited to) are the case
// where compression actually pays off, and they're not the multi-GB media
// uploads where a slow max-quality pass would be a real cost.
function compressStream() {
  return zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
}

function decompressStream() {
  return zlib.createBrotliDecompress();
}

module.exports = { MAGIC, compressStream, decompressStream };

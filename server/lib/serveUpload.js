const fs = require("fs");
const path = require("path");

// Serves an uploaded file (data/uploads — see routes/uploads.js).
//
// Not express.static: a 2GB video needs real HTTP Range support, or the browser
// can only play it from the start and seeking does nothing. express.static does
// handle ranges, but it also needs the directory to be publicly mounted with its
// own path semantics; doing it here keeps the filename validation, the
// Content-Disposition, and the no-execute headers in one obvious place.

const MIME = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};

// Only ever the exact shape routes/uploads.js writes: a random id, optionally
// one short extension. Anything else is refused rather than normalized, so no
// amount of traversal encoding gets out of the directory.
const FILENAME_RE = /^[a-z0-9]+_[a-f0-9]{16}(\.[a-z0-9]{1,12})?$/;

function serveUpload(uploadDir) {
  return (req, res) => {
    const filename = req.params.filename ?? "";
    if (!FILENAME_RE.test(filename)) return res.status(404).end();

    const filePath = path.join(uploadDir, filename);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return res.status(404).end();
    }
    if (!stat.isFile()) return res.status(404).end();

    const ext = path.extname(filename);
    const type = MIME[ext];

    // An uploaded file is untrusted content served from this app's own origin,
    // so anything the browser might *render* (SVG with a <script>, an .html)
    // would run as same-origin script. Unknown types download instead of
    // rendering, and nosniff stops the browser second-guessing that.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", type ?? "application/octet-stream");
    if (!type || ext === ".svg") res.setHeader("Content-Disposition", "attachment");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable"); // the name is random and content never changes
    res.setHeader("Accept-Ranges", "bytes");

    // Range support — this is what makes seeking in a long video work at all,
    // and what lets a browser resume a large download.
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (match) {
        const hasStart = match[1] !== "";
        const hasEnd = match[2] !== "";
        let start;
        let end;
        if (hasStart) {
          start = Number(match[1]);
          end = hasEnd ? Number(match[2]) : stat.size - 1;
        } else if (hasEnd) {
          // "bytes=-500" means the *last* 500 bytes.
          start = Math.max(0, stat.size - Number(match[2]));
          end = stat.size - 1;
        }
        if (start !== undefined && start < stat.size && end >= start) {
          end = Math.min(end, stat.size - 1);
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
          res.setHeader("Content-Length", end - start + 1);
          if (req.method === "HEAD") return res.end();
          return fs.createReadStream(filePath, { start, end }).pipe(res);
        }
        res.status(416).setHeader("Content-Range", `bytes */${stat.size}`);
        return res.end();
      }
    }

    res.setHeader("Content-Length", stat.size);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  };
}

// Removes the files behind a set of attachments — called when a message or a
// whole chat is deleted, so a 2GB video doesn't sit on disk forever after the
// only message pointing at it is gone. Silent on anything it can't remove: a
// missing file is the desired end state anyway.
async function deleteUploadedFiles(uploadDir, attachments) {
  for (const a of attachments ?? []) {
    const url = a?.url;
    if (typeof url !== "string" || !url.startsWith("/uploads/")) continue;
    const filename = url.slice("/uploads/".length);
    if (!FILENAME_RE.test(filename)) continue;
    await fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {});
  }
}

module.exports = { serveUpload, deleteUploadedFiles, FILENAME_RE };

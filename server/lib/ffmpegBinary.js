// Which ffmpeg to run. The Docker image installs with --ignore-scripts, so
// ffmpeg-static's postinstall never downloads its binary there and the path it
// reports doesn't exist — fall back to the system ffmpeg (apk add ffmpeg).
const fs = require("fs");

function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const bundled = require("ffmpeg-static");
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {
  }
  return "ffmpeg";
}

module.exports = { ffmpegPath: resolveFfmpeg() };

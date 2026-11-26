import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { MIME_BY_EXT, UPLOAD_DIR } from "@/lib/server/media";

// Serves uploaded files, with HTTP range support so videos can seek.
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = path.basename((await params).name);
  const file = path.join(UPLOAD_DIR, name);
  const ext = path.extname(name).toLowerCase();
  const audio = new URL(req.url).searchParams.get("audio") === "1";
  const type = audio ? ({ ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".webm": "audio/webm" } as Record<string, string>)[ext] : MIME_BY_EXT[ext];
  if (!type || !fs.existsSync(file)) return new Response("Not found", { status: 404 });

  const size = fs.statSync(file).size;
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}

const NodeMediaServer = require("node-media-server");
const context = require("node-media-server/src/node_core_ctx");
const live = require("./data/liveStreams");

const RTMP_PORT = Number(process.env.RTMP_PORT || 1935);
const RTMP_HTTP_PORT = Number(process.env.RTMP_HTTP_PORT || 8010);
const RTMP_HTTP_HOST = "127.0.0.1";

const KEY_RE = /^[a-f0-9]{32}$/;

let nms = null;
let onChange = () => {};

function streamKeyFromPath(streamPath) {
  const key = String(streamPath ?? "").split("/").filter(Boolean).pop() ?? "";
  return KEY_RE.test(key) ? key : null;
}

function start({ onStreamChange } = {}) {
  if (nms) return nms;
  onChange = typeof onStreamChange === "function" ? onStreamChange : () => {};

  nms = new NodeMediaServer({
    logType: 1,
    rtmp: {
      port: RTMP_PORT,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60,
    },
    http: { port: RTMP_HTTP_PORT, host: RTMP_HTTP_HOST, allow_origin: "*", mediaroot: "./data/rtmp" },
  });

  nms.on("prePublish", (id, streamPath) => {
    const session = nms.getSession(id);
    const key = streamKeyFromPath(streamPath);
    const stream = key ? live.getLiveStreamByKey(key) : null;
    if (!stream || stream.source !== "rtmp") {
      session?.reject?.();
      return;
    }
    live.setRtmpLive(stream.id, true);
    onChange(stream, true);
  });

  nms.on("donePublish", (id, streamPath) => {
    const key = streamKeyFromPath(streamPath);
    const stream = key ? live.getLiveStreamByKey(key) : null;
    if (!stream) return;
    live.setRtmpLive(stream.id, false);
    onChange(stream, false);
  });

  nms.on("prePlay", (id) => {
    const session = nms.getSession(id);
    const ip = String(session?.ip ?? "");
    if (!ip.includes("127.0.0.1") && !ip.includes("::1")) session?.reject?.();
  });

  nms.run();
  return nms;
}

function stopPublisher(streamKey) {
  if (!nms || !KEY_RE.test(String(streamKey ?? ""))) return false;
  const sessionId = context.publishers.get(`/live/${streamKey}`);
  const session = sessionId ? context.sessions.get(sessionId) : null;
  if (!session) return false;
  (session.stop ?? session.reject)?.call(session);
  return true;
}

function internalFlvUrl(streamKey) {
  if (!KEY_RE.test(String(streamKey ?? ""))) return null;
  return `http://${RTMP_HTTP_HOST}:${RTMP_HTTP_PORT}/live/${streamKey}.flv`;
}

function ingestUrlFor(requestHost) {
  const host = String(requestHost ?? "").split(":")[0] || "localhost";
  return `rtmp://${host}:${RTMP_PORT}/live`;
}

module.exports = { start, internalFlvUrl, ingestUrlFor, stopPublisher, RTMP_PORT, KEY_RE };

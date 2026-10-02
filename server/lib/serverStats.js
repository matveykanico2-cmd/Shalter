const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const db = require("../db");
const { wsStats } = require("../ws");
const { UPLOAD_DIR, isS3Enabled } = require("./storage");

const DATA_DIR = path.join(process.cwd(), "data");

let lastCpuSample = null;

function cpuSample() {
  return {
    at: Date.now(),
    cores: os.cpus().map((c) => {
      const t = c.times;
      return { total: t.user + t.nice + t.sys + t.idle + t.irq, idle: t.idle };
    }),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function diffCpu(before, after) {
  const perCore = after.cores.map((c, i) => {
    const prev = before.cores[i];
    if (!prev) return 0;
    const total = c.total - prev.total;
    const idle = c.idle - prev.idle;
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, ((total - idle) / total) * 100));
  });
  const usage = perCore.length ? perCore.reduce((a, b) => a + b, 0) / perCore.length : 0;
  return { usage, perCore, windowMs: after.at - before.at };
}

async function cpuUsage() {
  const prev = lastCpuSample;
  const now = cpuSample();
  lastCpuSample = now;
  const gap = prev ? now.at - prev.at : Infinity;
  if (prev && gap >= 1000 && gap <= 60_000) return diffCpu(prev, now);
  await sleep(300);
  const after = cpuSample();
  lastCpuSample = after;
  return diffCpu(now, after);
}

async function diskUsage(dir) {
  try {
    const s = await fs.statfs(dir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = (s.blocks - s.bfree) * s.bsize;
    return { path: dir, total, free, used, usedPercent: used + free > 0 ? (used / (used + free)) * 100 : 0 };
  } catch (err) {
    return { path: dir, error: err.message };
  }
}

async function fileSize(file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

const WALK_LIMIT = 20_000;

async function dirSize(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    return { bytes: 0, files: 0, missing: true };
  }
  let bytes = 0;
  let files = 0;
  let truncated = false;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (files >= WALK_LIMIT) {
      truncated = true;
      break;
    }
    try {
      bytes += (await fs.stat(path.join(e.parentPath ?? e.path, e.name))).size;
      files++;
    } catch {
    }
  }
  return { bytes, files, truncated };
}

function dbStats() {
  const pageSize = db.pragma("page_size", { simple: true });
  const pageCount = db.pragma("page_count", { simple: true });
  const freePages = db.pragma("freelist_count", { simple: true });
  const all = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const virtualTables = all.filter((t) => /^CREATE VIRTUAL TABLE/i.test(t.sql ?? "")).map((t) => t.name);
  const isShadow = (name) => virtualTables.some((v) => name !== v && name.startsWith(`${v}_`));
  const tables = all
    .filter((t) => !isShadow(t.name))
    .map((t) => {
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name.replace(/"/g, '""')}"`).get();
      return { name: t.name, rows: n };
    })
    .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
  return {
    pageSize,
    pageCount,
    freeBytes: freePages * pageSize,
    tables,
    totalRows: tables.reduce((a, t) => a + t.rows, 0),
  };
}

async function collectServerStats() {
  const dbPath = db.name;
  const [cpu, disk, uploads, dbFile, walFile, shmFile] = await Promise.all([
    cpuUsage(),
    diskUsage(DATA_DIR),
    dirSize(UPLOAD_DIR),
    fileSize(dbPath),
    fileSize(`${dbPath}-wal`),
    fileSize(`${dbPath}-shm`),
  ]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const mem = process.memoryUsage();

  return {
    at: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      node: process.version,
      uptimeSec: Math.floor(os.uptime()),
      cpuModel: os.cpus()[0]?.model?.trim() || "неизвестно",
      cores: os.cpus().length,
    },
    cpu: {
      usagePercent: cpu.usage,
      perCore: cpu.perCore,
      windowMs: cpu.windowMs,
      loadAvg: os.platform() === "win32" ? null : os.loadavg(),
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      usedPercent: totalMem ? ((totalMem - freeMem) / totalMem) * 100 : 0,
    },
    disk,
    process: {
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      sharePercent: totalMem ? (mem.rss / totalMem) * 100 : 0,
    },
    storage: {
      db: dbFile,
      wal: walFile,
      shm: shmFile,
      uploads: uploads.bytes,
      uploadFiles: uploads.files,
      uploadsTruncated: !!uploads.truncated,
      uploadsInS3: isS3Enabled,
      total: dbFile + walFile + shmFile + uploads.bytes,
    },
    db: dbStats(),
    realtime: wsStats(),
  };
}

module.exports = { collectServerStats };

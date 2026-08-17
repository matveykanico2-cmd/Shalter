// Состояние машины, на которой живёт Shalter: диск, процессор, оперативная
// память, размер базы и вложений. Всё это обычно смотрят по ssh (`df -h`,
// `top`, `du -sh data/`) — а развёртывание, куда попадают только пушем (см.
// DEPLOY.md), такой возможности не даёт. Поэтому те же самые числа отдаются
// администратору в приложение: «почему перестали грузиться файлы» и «почему
// всё тормозит» — вопросы, на которые без них ответить нечем.
//
// Только чтение: ничего здесь не чинит и не чистит, ни один показатель не
// зависит от содержимого чужих сообщений — это счётчики ОС и размеры файлов.
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const db = require("../db");
const { wsStats } = require("../ws");
const { UPLOAD_DIR } = require("../routes/uploads");

const DATA_DIR = path.join(process.cwd(), "data");

// os.cpus() отдаёт счётчики времени с момента загрузки, а не «загрузку
// сейчас» — процент считается только по разнице двух замеров. Предыдущий
// замер держим здесь: при опросе раз в несколько секунд разница между
// соседними запросами и есть честная средняя загрузка за этот интервал, без
// искусственной паузы внутри запроса.
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
  // Свежий замер годится как «предыдущий» только если он не только что сделан
  // (иначе разница — шум) и не протух (иначе это средняя за полчаса, а не за
  // «сейчас»). Первый заход после старта попадает сюда же — тогда меряем
  // короткой паузой.
  const gap = prev ? now.at - prev.at : Infinity;
  if (prev && gap >= 1000 && gap <= 60_000) return diffCpu(prev, now);
  await sleep(300);
  const after = cpuSample();
  lastCpuSample = after;
  return diffCpu(now, after);
}

// Свободное место на разделе, где лежит data/ — именно оно кончается первым,
// потому что туда пишутся и база, и все вложения.
async function diskUsage(dir) {
  try {
    const s = await fs.statfs(dir);
    const total = s.blocks * s.bsize;
    // bavail, а не bfree: часть блоков зарезервирована под root и обычному
    // процессу недоступна — df считает так же, и «свободно» должно совпадать
    // с тем, что человек увидит в консоли.
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

// Рекурсивный обход с потолком по числу файлов: на пустом деплое это десяток
// вложений, но каталог загрузок растёт без ограничений, и запрос статистики
// не должен превращаться в обход сотен тысяч файлов. Если упёрлись в потолок,
// об этом говорится в ответе, а не молча показывается заниженный размер.
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
      // Файл удалили между readdir и stat — обычное дело, не повод падать.
    }
  }
  return { bytes, files, truncated };
}

// Сколько строк в каждой таблице. Таблицы перечисляются из sqlite_master, а не
// списком в коде: схема (server/db.js) растёт, а забытая в списке таблица —
// это ровно та таблица, которая незаметно и распухнет.
function dbStats() {
  const pageSize = db.pragma("page_size", { simple: true });
  const pageCount = db.pragma("page_count", { simple: true });
  const freePages = db.pragma("freelist_count", { simple: true });
  const all = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  // У полнотекстового индекса (messages_fts) есть служебные таблицы-спутники
  // messages_fts_data/_idx/_docsize/_config — это внутреннее устройство FTS5, и
  // «5 строк» в них не значат ничего. В списке остаётся сам индекс.
  const virtualTables = all.filter((t) => /^CREATE VIRTUAL TABLE/i.test(t.sql ?? "")).map((t) => t.name);
  const isShadow = (name) => virtualTables.some((v) => name !== v && name.startsWith(`${v}_`));
  const tables = all
    .filter((t) => !isShadow(t.name))
    .map((t) => {
      // Имя приходит из самой схемы, не от пользователя, но интерполяция в SQL
      // всё равно только через кавычки — параметром имя таблицы не подставить.
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name.replace(/"/g, '""')}"`).get();
      return { name: t.name, rows: n };
    })
    // Самые большие сверху: вопрос к этому списку всегда «от чего растёт база».
    .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
  return {
    pageSize,
    pageCount,
    // Место, которое база занимает на диске, но уже не использует — после
    // больших удалений его возвращает только VACUUM.
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
      // На Windows os.loadavg() всегда [0,0,0] — там это просто не считается.
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
      // Доля всей памяти машины, занятая именно этим процессом — отвечает на
      // «сервер съел всю память или это кто-то другой».
      sharePercent: totalMem ? (mem.rss / totalMem) * 100 : 0,
    },
    storage: {
      db: dbFile,
      wal: walFile,
      shm: shmFile,
      uploads: uploads.bytes,
      uploadFiles: uploads.files,
      uploadsTruncated: !!uploads.truncated,
      total: dbFile + walFile + shmFile + uploads.bytes,
    },
    db: dbStats(),
    realtime: wsStats(),
  };
}

module.exports = { collectServerStats };

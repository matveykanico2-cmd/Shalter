const { promises: fs } = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");

// Serializes reads/writes per file *within this process*.
const locks = new Map();

// Cross-process lock (a plain lockfile) for the same guarantee if two server
// instances ever point at the same data/ directory — the in-process Map above
// can't see another process's in-flight read-modify-write, so two processes
// interleaving there was a real data-loss bug (a stale server left running
// during a restart truncated users.json). Exclusive-create is atomic even
// across processes, unlike the map-based lock.
async function acquireFileLock(file) {
  const lockPath = path.join(DATA_DIR, `.${file}.lockfile`);
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.close();
      return () => fs.unlink(lockPath).catch(() => {});
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      // Stale lock from a crashed process — don't wait forever for it.
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 5000) {
          await fs.unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

async function runLocked(file, fn) {
  const release = await acquireFileLock(file);
  try {
    return await fn();
  } finally {
    await release();
  }
}

function withLock(file, fn) {
  const prev = locks.get(file) ?? Promise.resolve();
  const next = prev.then(
    () => runLocked(file, fn),
    () => runLocked(file, fn)
  );
  locks.set(
    file,
    next.catch(() => undefined)
  );
  return next;
}

async function readFile(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

// Write to a temp file then rename, so a crash mid-write never leaves a
// truncated/corrupt JSON file behind (rename is atomic on the same filesystem).
async function writeFile(name, data) {
  const file = path.join(DATA_DIR, `${name}.json`);
  const tmp = path.join(DATA_DIR, `.${name}.json.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, file);
}

function readCollection(name) {
  return withLock(name, () => readFile(name));
}

function writeCollection(name, data) {
  return withLock(name, () => writeFile(name, data));
}

function readDoc(name) {
  return withLock(name, () => readFile(name));
}

function writeDoc(name, data) {
  return withLock(name, () => writeFile(name, data));
}

// Read + mutate + write as a single locked step so two concurrent mutators
// can't both read the same base array and have one write clobber the other's.
function updateCollection(name, mutate) {
  return withLock(name, async () => {
    const items = await readFile(name);
    const next = await mutate(items);
    await writeFile(name, next);
    return next;
  });
}

function updateDoc(name, mutate) {
  return withLock(name, async () => {
    const doc = await readFile(name);
    const next = await mutate(doc);
    await writeFile(name, next);
    return next;
  });
}

module.exports = { readCollection, writeCollection, readDoc, writeDoc, updateCollection, updateDoc };

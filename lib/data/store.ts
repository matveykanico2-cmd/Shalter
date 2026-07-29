import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

// Serializes reads/writes per file so concurrent API calls in dev
// (React strict-mode double effects, fast typing) can't interleave writes.
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    file,
    next.catch(() => undefined)
  );
  return next;
}

async function readFile<T>(name: string): Promise<T> {
  const file = path.join(DATA_DIR, `${name}.json`);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeFile<T>(name: string, data: T): Promise<void> {
  const file = path.join(DATA_DIR, `${name}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function readCollection<T>(name: string): Promise<T[]> {
  return withLock(name, () => readFile<T[]>(name));
}

export function writeCollection<T>(name: string, data: T[]): Promise<void> {
  return withLock(name, () => writeFile<T[]>(name, data));
}

export function readDoc<T>(name: string): Promise<T> {
  return withLock(name, () => readFile<T>(name));
}

export function writeDoc<T>(name: string, data: T): Promise<void> {
  return withLock(name, () => writeFile<T>(name, data));
}

// Read + mutate + write as a single locked step. Plain readCollection() then
// writeCollection() (as separate calls) releases the lock in between, so two
// concurrent mutators can both read the same base array and one write clobbers
// the other's — this keeps the whole read-modify-write atomic per file.
export function updateCollection<T>(name: string, mutate: (items: T[]) => T[] | Promise<T[]>): Promise<T[]> {
  return withLock(name, async () => {
    const items = await readFile<T[]>(name);
    const next = await mutate(items);
    await writeFile(name, next);
    return next;
  });
}

export function updateDoc<T>(name: string, mutate: (doc: T) => T | Promise<T>): Promise<T> {
  return withLock(name, async () => {
    const doc = await readFile<T>(name);
    const next = await mutate(doc);
    await writeFile(name, next);
    return next;
  });
}

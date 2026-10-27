// Перевод через бесплатный эндпоинт Google — как translateOne, translateChunk и splitIntoChunks
// в server/routes/translate.js.

export async function translateOne(text: string, target: string, source = "auto"): Promise<{ translated: string; detectedLang: unknown }> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t` +
    `&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&q=${encodeURIComponent(text)}`;
  const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!upstream.ok) throw new Error(`upstream responded ${upstream.status}`);
  const data: any = await upstream.json();
  return { translated: (data?.[0] ?? []).map((chunk: any) => chunk?.[0] ?? "").join(""), detectedLang: data?.[2] ?? null };
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Сколько URL-кодированного текста влезает в один GET к Google (лимит URL ~16 КБ).
const CHUNK_ENCODED_LIMIT = 6000;

// Переводит пачку строк одним запросом: склеиваем через перевод строки и режем
// ответ обратно. Если Google склеил или разбил строки — переводим эту пачку по одной.
export async function translateChunk(texts: string[], target: string): Promise<(string | null)[]> {
  if (texts.length > 1) {
    try {
      const { translated } = await translateOne(texts.join("\n"), target, "ru");
      const lines = translated.split("\n").map((l) => l.trim());
      if (lines.length === texts.length && lines.every(Boolean)) return lines;
    } catch (err) {
      console.error("batch translate chunk failed:", err);
    }
  }
  return mapWithConcurrency(texts, 4, async (text) => {
    try {
      return (await translateOne(text, target, "ru")).translated.trim() || null;
    } catch (err) {
      console.error("batch translate item failed:", err);
      return null;
    }
  });
}

export function splitIntoChunks(texts: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const text of texts) {
    const len = encodeURIComponent(text).length + 3;
    // Многострочные строки идут отдельно — их нельзя склеивать через \n.
    if (text.includes("\n")) {
      chunks.push([text]);
      continue;
    }
    if (current.length && size + len > CHUNK_ENCODED_LIMIT) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += len;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

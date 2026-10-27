// Нормализация ответов для сравнения «форма, а не значения»: id, даты и токены
// меняются от прогона к прогону и между реализациями, их заменяют метки.
// Одинаковые значения получают одинаковые метки — связи между полями сохраняются
// (senderId сообщения совпадает с id пользователя → обе станут <id:u1>).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const GEN_ID = /^([a-z]+)_[a-z0-9]{8,}$/;

export function normalize<T>(value: T, extraIds: string[] = []): T {
  const ids = new Map<string, string>();
  const perPrefix = new Map<string, number>();
  const label = (raw: string, prefix: string) => {
    let l = ids.get(raw);
    if (!l) {
      const n = (perPrefix.get(prefix) ?? 0) + 1;
      perPrefix.set(prefix, n);
      l = `<id:${prefix}${n}>`;
      ids.set(raw, l);
    }
    return l;
  };
  for (const id of extraIds) label(id, GEN_ID.exec(id)?.[1] ?? "x");

  const walk = (v: any): any => {
    if (typeof v === "string") {
      if (ISO_DATE.test(v)) return "<date>";
      const m = GEN_ID.exec(v);
      if (m || ids.has(v)) return label(v, m?.[1] ?? "x");
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return walk(value);
}

/** Набор ключей объекта — для проверки, что реализация не потеряла и не добавила поля. */
export function keysOf(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

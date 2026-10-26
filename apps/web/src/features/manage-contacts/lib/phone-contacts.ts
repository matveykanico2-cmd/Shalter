// Номера из адресной книги без нативного приложения — public/js/lib/phoneContacts.js:
// Contact Picker API (Chrome на Android), файлы .vcf и вставленный список.
import type { PhoneEntry } from "../api/contacts";

type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };

export function isContactPickerSupported() {
  return typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
}

export async function pickPhoneContacts(): Promise<PhoneEntry[]> {
  const manager = (navigator as Navigator & { contacts: ContactsManager }).contacts;
  const selected = await manager.select(["name", "tel"], { multiple: true });
  const out: PhoneEntry[] = [];
  for (const c of selected ?? []) {
    const name = (c.name ?? []).filter(Boolean).join(" ").trim();
    for (const tel of c.tel ?? []) if (tel) out.push({ name, phone: String(tel) });
  }
  return out;
}

function decodeValue(value: string, params: string[]) {
  if (!params.some((p) => p.includes("QUOTED-PRINTABLE"))) return value;
  try {
    const bytes: number[] = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
        bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(value.charCodeAt(i));
    }
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
}

export function phoneKey(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // 8 999 … — то же, что +7 999 …
  return digits.length === 11 && digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
}

function dedupe(entries: PhoneEntry[]) {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = phoneKey(e.phone);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Карточки vCard: имя (FN или N) и все TEL каждой карточки. */
export function parseVCard(text: string): PhoneEntry[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const out: PhoneEntry[] = [];
  let name = "";
  let phones: string[] = [];
  const flush = () => {
    for (const phone of phones) out.push({ name: name.trim(), phone });
    name = "";
    phones = [];
  };
  for (const rawLine of unfolded.split("\n")) {
    const line = rawLine.trim();
    const colon = line.indexOf(":");
    if (!line || colon === -1) continue;
    const parts = line.slice(0, colon).split(";");
    const prop = (parts[0]!.split(".").pop() ?? "").toUpperCase();
    const params = parts.slice(1).map((p) => p.toUpperCase());
    const value = line.slice(colon + 1);
    if (prop === "BEGIN" && value.toUpperCase() === "VCARD") {
      name = "";
      phones = [];
    } else if (prop === "END" && value.toUpperCase() === "VCARD") flush();
    else if (prop === "FN" && !name) name = decodeValue(value, params);
    else if (prop === "N" && !name) {
      const [last = "", first = ""] = decodeValue(value, params).split(";");
      name = `${first} ${last}`.trim();
    } else if (prop === "TEL" && value.trim()) phones.push(value.trim());
  }
  flush();
  return dedupe(out);
}

/** Несколько файлов .vcf; нечитаемые пропускаются. */
export async function readVCardFiles(files: File[]) {
  const all: PhoneEntry[] = [];
  for (const file of files) {
    try {
      all.push(...parseVCard(await file.text()));
    } catch {
      // Файл не прочитался — остальные всё равно проверим.
    }
  }
  return dedupe(all);
}

/** «Мама +7 900 000 00 00» — по строке или через запятую; имя — то, что перед номером. */
export function parsePastedContacts(text: string): PhoneEntry[] {
  const out: PhoneEntry[] = [];
  for (const rawLine of text.split(/[\n,;]+/)) {
    const line = rawLine.trim();
    const match = line.match(/\+?[\d][\d\s().-]{7,}\d/);
    if (!line || !match) continue;
    const name = line
      .slice(0, match.index)
      .trim()
      .replace(/[-–—:,]+$/, "")
      .trim();
    out.push({ name, phone: match[0].trim() });
  }
  return dedupe(out);
}

export function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && "ontouchend" in document);
}

export function isContactPickerSupported() {
  return typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
}

export async function pickPhoneContacts() {
  const selected = await navigator.contacts.select(["name", "tel"], { multiple: true });
  const out = [];
  for (const c of selected ?? []) {
    const name = (c.name ?? []).filter(Boolean).join(" ").trim();
    for (const tel of c.tel ?? []) {
      if (tel) out.push({ name, phone: String(tel) });
    }
  }
  return out;
}

export function parseVCard(text) {
  const unfolded = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");

  const out = [];
  let name = "";
  let phones = [];

  const flush = () => {
    for (const phone of phones) out.push({ name: name.trim(), phone });
    name = "";
    phones = [];
  };

  for (const rawLine of unfolded.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawProp = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const parts = rawProp.split(";");
    const prop = parts[0].split(".").pop().toUpperCase();
    const params = parts.slice(1).map((p) => p.toUpperCase());

    if (prop === "BEGIN" && value.toUpperCase() === "VCARD") {
      name = "";
      phones = [];
    } else if (prop === "END" && value.toUpperCase() === "VCARD") {
      flush();
    } else if (prop === "FN" && !name) {
      name = decodeValue(value, params);
    } else if (prop === "N" && !name) {
      const [last = "", first = ""] = decodeValue(value, params).split(";");
      name = `${first} ${last}`.trim();
    } else if (prop === "TEL") {
      const phone = value.trim();
      if (phone) phones.push(phone);
    }
  }
  flush();

  return dedupe(out);
}

function decodeValue(value, params) {
  if (!params.some((p) => p.includes("QUOTED-PRINTABLE"))) return value;
  try {
    const bytes = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
        bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(value.charCodeAt(i));
      }
    }
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
}

function phoneKey(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

function dedupe(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = phoneKey(e.phone);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function readVCardFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => resolve(parseVCard(reader.result));
    reader.readAsText(file, "utf-8");
  });
}

export async function readVCardFiles(files) {
  const all = [];
  for (const file of files) {
    try {
      all.push(...(await readVCardFile(file)));
    } catch {
    }
  }
  return dedupe(all);
}

export function parsePastedContacts(text) {
  const out = [];
  for (const rawLine of String(text ?? "").split(/[\n,;]+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/\+?[\d][\d\s().-]{7,}\d/);
    if (!match) continue;
    const phone = match[0].trim();
    const name = line
      .slice(0, match.index)
      .trim()
      .replace(/[-–—:,]+$/, "")
      .trim();
    out.push({ name, phone });
  }
  return dedupe(out);
}

export function isIos() {
  return typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && "ontouchend" in document));
}

// Getting a phone's address book into the app, without a native plugin.
//
// Two routes, because no single one works everywhere:
//
//  1. The Contact Picker API (navigator.contacts.select). The user picks which
//     contacts to share from a system sheet — the page never gets the whole
//     address book, only what was ticked. Chrome/Edge on Android, secure
//     context only; not implemented by desktop browsers or iOS Safari at all.
//
//  2. A vCard (.vcf) file. Every phone can export its contacts to one
//     (Android: Contacts → Export; iOS: share a contact / iCloud export), and
//     it works on desktop too. Parsed here in the browser; the file itself is
//     never uploaded anywhere.
//
// Only names and phone numbers are read either way — emails, addresses, photos
// and notes in a vCard are ignored rather than parsed and thrown away later.

export function isContactPickerSupported() {
  return typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;
}

// Returns [{ name, phone }], one entry per number (a contact with three numbers
// becomes three entries — any of them might be the one they registered with).
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

// vCard 2.1/3.0/4.0 — the three versions phones actually export. Handled here:
//   - CRLF or LF line endings
//   - folded lines (a continuation starts with a space or tab)
//   - property parameters (TEL;CELL;VOICE:, TEL;TYPE=CELL:, item1.TEL:)
//   - quoted-printable names, which Android's older exports still emit
export function parseVCard(text) {
  const unfolded = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, ""); // a line beginning with space/tab continues the previous one

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
    // "item1.TEL;TYPE=CELL" -> prop "TEL", params ["TYPE=CELL"]
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
      // "Фамилия;Имя;;;" -> "Имя Фамилия"
      const [last = "", first = ""] = decodeValue(value, params).split(";");
      name = `${first} ${last}`.trim();
    } else if (prop === "TEL") {
      const phone = value.trim();
      if (phone) phones.push(phone);
    }
  }
  flush(); // tolerate a file whose last card has no END:VCARD

  return dedupe(out);
}

// Android's older exporter writes non-ASCII names as quoted-printable, which
// otherwise shows up as "=D0=98=D0=B2=D0=B0=D0=BD" instead of "Иван".
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

// Mirrors server/lib/phoneMatch.js's phoneKey — the same number written two
// ways has to collapse to one entry here too, or "+7 900 111 22 33" and
// "8 900 111 22 33" get uploaded as two separate people.
function phoneKey(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  return digits;
}

// Same number listed under two contacts (or twice on one) is one person.
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

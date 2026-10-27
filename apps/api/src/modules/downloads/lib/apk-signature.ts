import { X509Certificate } from "node:crypto";
import fs from "node:fs";

// APK, подписанный отладочным ключом (CN=Android Debug), не ставится поверх release-версии
// (RuStore, GitHub Release) — Android пишет «конфликт пакетов». Читаем сертификат из APK
// Signing Block (v2/v3); результат кэшируем по mtime и размеру — как в server/routes/downloads.js.
const debugSignedCache = new Map<string, boolean>();

export function apkIsDebugSigned(fullPath: string): boolean {
  try {
    const { mtimeMs, size } = fs.statSync(fullPath);
    const key = `${fullPath}:${mtimeMs}:${size}`;
    const cached = debugSignedCache.get(key);
    if (cached !== undefined) return cached;
    const b = fs.readFileSync(fullPath);
    let e = b.length - 22;
    while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
    const cd = b.readUInt32LE(e + 16);
    let debug = false;
    if (b.toString("latin1", cd - 16, cd) === "APK Sig Block 42") {
      const size64 = Number(b.readBigUInt64LE(cd - 24));
      let p = cd - size64 - 8 + 8;
      while (p < cd - 24) {
        const len = Number(b.readBigUInt64LE(p));
        const id = b.readUInt32LE(p + 8);
        if (id === 0x7109871a || id === 0xf05368c0) {
          let q = p + 12 + 12;
          q += 4 + b.readUInt32LE(q); // digests
          q += 4; // certificates seq length
          const certLen = b.readUInt32LE(q);
          const cert = new X509Certificate(b.subarray(q + 4, q + 4 + certLen));
          debug = /CN=Android Debug/.test(cert.subject);
          break;
        }
        p += 8 + len;
      }
    }
    debugSignedCache.set(key, debug);
    return debug;
  } catch {
    return false;
  }
}

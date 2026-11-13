import crypto from "node:crypto";

/**
 * AES-256-CTR с произвольного байта потока: счётчик IV сдвигается на offset/16 блоков, а
 * остаток блока проматывается. Так части файла шифруются по отдельности и стыкуются в один
 * шифротекст, который расшифровывается целиком с offset 0.
 */
export function ctrAt(key: Buffer, iv: Buffer, offset: number, mode: "cipher" | "decipher" = "cipher") {
  const counter = Buffer.from(iv);
  let carry = BigInt(Math.floor(offset / 16));
  for (let i = 15; i >= 0 && carry > 0n; i--) {
    const sum = BigInt(counter[i]!) + (carry & 0xffn);
    counter[i] = Number(sum & 0xffn);
    carry = (carry >> 8n) + (sum >> 8n);
  }
  const stream = mode === "cipher" ? crypto.createCipheriv("aes-256-ctr", key, counter) : crypto.createDecipheriv("aes-256-ctr", key, counter);
  const skip = offset % 16;
  if (skip) stream.update(Buffer.alloc(skip));
  return stream;
}

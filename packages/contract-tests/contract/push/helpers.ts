// Веб-push глазами браузера: ключи подписки (p256dh/auth) и расшифровка тела
// пуша (RFC 8291, Content-Encoding: aes128gcm). Ключи подписки генерирует сам
// тест, поэтому может прочитать то, что сервер отправил «в push-сервис».
import crypto from "node:crypto";

export interface BrowserSubscription {
  /** То, что браузер отдаёт в PushSubscription.toJSON(). */
  json: { endpoint: string; expirationTime: null; keys: { p256dh: string; auth: string } };
  decrypt(body: Buffer): string;
}

export function browserSubscription(endpoint: string): BrowserSubscription {
  const ecdh = crypto.createECDH("prime256v1");
  const uaPublic = ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    json: { endpoint, expirationTime: null, keys: { p256dh: uaPublic.toString("base64url"), auth: auth.toString("base64url") } },
    decrypt(body: Buffer): string {
      // Заголовок записи: salt(16) | rs(4) | idlen(1) | keyid (публичный ключ сервера).
      const salt = body.subarray(0, 16);
      const idlen = body[20];
      const asPublic = body.subarray(21, 21 + idlen);
      const ciphertext = body.subarray(21 + idlen);
      const shared = ecdh.computeSecret(asPublic);
      const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
      const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, auth, keyInfo, 32));
      const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
      const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
      const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
      decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
      const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
      // Последняя запись: данные | 0x02 | нули.
      const end = plain.lastIndexOf(2);
      return plain.subarray(0, end).toString("utf8");
    },
  };
}

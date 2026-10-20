// Программный аутентификатор WebAuthn для тестов: ключ ES256 (P-256) из node:crypto,
// attestation "none", минимальный CBOR-кодировщик. Позволяет пройти регистрацию и
// вход по ключу доступа без браузера.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

type Cbor = number | string | Buffer | Map<Cbor, Cbor> | { [k: string]: Cbor };

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

export function cbor(v: Cbor): Buffer {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") {
    const s = Buffer.from(v, "utf8");
    return Buffer.concat([head(3, s.length), s]);
  }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  const entries: Array<[Cbor, Cbor]> = v instanceof Map ? [...v] : Object.entries(v);
  return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, val]) => [cbor(k), cbor(val)])]);
}

const sha256 = (d: Buffer | string) => createHash("sha256").update(d).digest();
const b64url = (b: Buffer) => b.toString("base64url");

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly jwk: { x: string; y: string };
  signCount = 0;

  constructor(readonly origin: string, readonly rpId = new URL(origin).hostname) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    this.jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  }

  get id(): string {
    return b64url(this.credentialId);
  }

  clientData(type: "webauthn.create" | "webauthn.get", challenge: string, origin = this.origin): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  /** Ответ navigator.credentials.create() в том виде, как его шлёт клиент. */
  attestation(challenge: string, opts: { rpId?: string; origin?: string; flags?: number } = {}) {
    const cose = new Map<Cbor, Cbor>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(this.jwk.x, "base64url")],
      [-3, Buffer.from(this.jwk.y, "base64url")],
    ]);
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(opts.rpId ?? this.rpId),
      Buffer.from([opts.flags ?? 0x45]), // UP | UV | AT
      Buffer.alloc(4), // signCount = 0
      Buffer.alloc(16), // aaguid
      idLen,
      this.credentialId,
      cbor(cose),
    ]);
    return {
      id: this.id,
      clientDataJSON: b64url(this.clientData("webauthn.create", challenge, opts.origin)),
      attestationObject: b64url(cbor({ fmt: "none", attStmt: new Map(), authData })),
    };
  }

  /** Ответ navigator.credentials.get(); signCount по умолчанию растёт на 1. */
  assertion(challenge: string, opts: { signCount?: number; corruptSignature?: boolean } = {}) {
    const count = opts.signCount ?? ++this.signCount;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(count);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([0x05]), counter]);
    const clientData = this.clientData("webauthn.get", challenge);
    let signature = sign("sha256", Buffer.concat([authData, sha256(clientData)]), this.privateKey);
    if (opts.corruptSignature) signature = sign("sha256", Buffer.from("другие данные"), this.privateKey);
    return {
      id: this.id,
      clientDataJSON: b64url(clientData),
      authenticatorData: b64url(authData),
      signature: b64url(signature),
    };
  }
}

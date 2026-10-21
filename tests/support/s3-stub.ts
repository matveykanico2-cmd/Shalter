// Заглушка S3 в памяти на loopback — для режима «файлы в бакете» (S3_BUCKET).
// Понимает ровно то, чем пользуется сервер: PutObject (+ CopyObject), HeadObject,
// GetObject с Range и If-Match, DeleteObject, ListObjectsV2, PutBucketCors,
// GetBucketEncryption; адреса path-style
// (S3_FORCE_PATH_STYLE=1). Подписанные ссылки на скачивание (X-Amz-Signature) проверяются
// подписчиком из AWS SDK (@smithy/signature-v4) — независимо от того, как их считает сервер.
// Подписи обычных запросов SDK не проверяются.
import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import type net from "node:net";
import { SignatureV4 } from "@smithy/signature-v4";

export interface S3Object {
  body: Buffer;
  contentType?: string;
  metadata: Record<string, string>;
  sse?: string;
  lastModified: Date;
}

export interface S3Stub {
  /** Объекты по ключу (без имени бакета). */
  objects: Map<string, S3Object>;
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
  /** Переменные окружения сервера для работы с этим бакетом. */
  /** Шифрование бакета по умолчанию (GetBucketEncryption); null — не включено. */
  bucketEncryption: string | null;
  /**
   * Вызывается перед каждым GET объекта (не по подписанной ссылке); вернёт true — бакет
   * ответит 403 AccessDenied (SDK такую ошибку не повторяет, в отличие от 5xx).
   * Можно подменить объект прямо здесь: ответ строится после.
   */
  beforeGet: ((key: string, range: string | undefined) => boolean | void | Promise<boolean | void>) | null;
  env(extra?: Record<string, string>): Record<string, string>;
  close(): Promise<void>;
}

class NodeSha256 {
  private readonly h;
  constructor(secret?: string | Uint8Array) {
    this.h = secret ? createHmac("sha256", secret) : createHash("sha256");
  }
  update(data: string | Uint8Array) {
    this.h.update(typeof data === "string" ? Buffer.from(data) : data);
  }
  async digest() {
    return new Uint8Array(this.h.digest());
  }
}

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const etag = (buf: Buffer) => `"${createHash("md5").update(buf).digest("hex")}"`;

export async function startS3Stub(): Promise<S3Stub> {
  const bucket = "test-bucket";
  const accessKey = "TESTACCESSKEY";
  const secretKey = "test-secret-key";
  const region = "us-east-1";
  const objects = new Map<string, S3Object>();
  let port = 0;
  const stub = { bucketEncryption: null as string | null, beforeGet: null as S3Stub["beforeGet"] };

  const signer = new SignatureV4({
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    region,
    service: "s3",
    sha256: NodeSha256 as never,
    uriEscapePath: false,
    applyChecksum: false,
  });

  // Подпись ссылки пересчитывается по тем же параметрам; плюс срок действия.
  async function presignOk(url: URL): Promise<boolean> {
    const q = url.searchParams;
    const amzDate = q.get("X-Amz-Date") ?? "";
    const expires = Number(q.get("X-Amz-Expires"));
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
    if (!m || !Number.isFinite(expires)) return false;
    const signed = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    if (Date.now() > signed.getTime() + expires * 1000) return false;
    if (q.get("X-Amz-Credential")?.split("/")[0] !== accessKey) return false;
    const query: Record<string, string> = {};
    for (const [k, v] of q) if (!k.startsWith("X-Amz-")) query[k] = v;
    const expected = await signer.presign(
      {
        method: "GET",
        protocol: "http:",
        hostname: "127.0.0.1",
        port,
        path: url.pathname,
        query,
        // Как в @aws-sdk/s3-request-presigner: тело не подписывается (UNSIGNED-PAYLOAD).
        headers: { host: `127.0.0.1:${port}`, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
      },
      {
        signingDate: signed,
        expiresIn: expires,
        unsignableHeaders: new Set(["x-amz-content-sha256"]),
        unhoistableHeaders: new Set(["x-amz-content-sha256"]),
      },
    );
    return expected.query?.["X-Amz-Signature"] === q.get("X-Amz-Signature");
  }

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      handle(req, res, Buffer.concat(chunks)).catch((err) => {
        res.statusCode = 500;
        res.end(String(err));
      });
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse, body: Buffer) {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const [, b, ...rest] = url.pathname.split("/");
    const key = decodeURIComponent(rest.join("/"));
    if (b !== bucket) {
      res.statusCode = 404;
      return res.end(xml("<Error><Code>NoSuchBucket</Code></Error>"));
    }

    if (!key) {
      if (req.method === "PUT" && url.searchParams.has("cors")) return res.end();
      if (req.method === "GET" && url.searchParams.has("encryption")) {
        res.setHeader("content-type", "application/xml");
        if (!stub.bucketEncryption) {
          res.statusCode = 404;
          return res.end(xml("<Error><Code>ServerSideEncryptionConfigurationNotFoundError</Code></Error>"));
        }
        return res.end(
          xml(
            `<ServerSideEncryptionConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>${stub.bucketEncryption}</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>`,
          ),
        );
      }
      if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
        const contents = keys
          .map((k) => {
            const o = objects.get(k)!;
            return `<Contents><Key>${esc(k)}</Key><LastModified>${o.lastModified.toISOString()}</LastModified><ETag>${etag(o.body)}</ETag><Size>${o.body.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
          })
          .join("");
        res.setHeader("content-type", "application/xml");
        return res.end(
          xml(
            `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket}</Name><Prefix>${esc(prefix)}</Prefix><KeyCount>${keys.length}</KeyCount><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
          ),
        );
      }
      res.statusCode = 501;
      return res.end();
    }

    const meta = (): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [h, v] of Object.entries(req.headers)) if (h.startsWith("x-amz-meta-")) out[h.slice(11)] = String(v);
      return out;
    };

    if (req.method === "PUT") {
      if (url.searchParams.has("uploadId") || url.searchParams.has("partNumber")) {
        res.statusCode = 501;
        return res.end("multipart не поддерживается заглушкой");
      }
      const copySource = req.headers["x-amz-copy-source"];
      if (copySource) {
        const srcKey = decodeURIComponent(String(copySource)).replace(/^\/?[^/]+\//, "");
        const src = objects.get(srcKey);
        if (!src) {
          res.statusCode = 404;
          return res.end(xml("<Error><Code>NoSuchKey</Code></Error>"));
        }
        const replace = req.headers["x-amz-metadata-directive"] === "REPLACE";
        const copy: S3Object = {
          body: src.body,
          contentType: replace ? (req.headers["content-type"] as string | undefined) : src.contentType,
          metadata: replace ? meta() : { ...src.metadata },
          sse: (req.headers["x-amz-server-side-encryption"] as string | undefined) ?? src.sse,
          lastModified: new Date(),
        };
        objects.set(key, copy);
        res.setHeader("content-type", "application/xml");
        return res.end(xml(`<CopyObjectResult><ETag>${etag(copy.body)}</ETag><LastModified>${copy.lastModified.toISOString()}</LastModified></CopyObjectResult>`));
      }
      if (String(req.headers["content-encoding"] ?? "").includes("aws-chunked")) {
        res.statusCode = 501;
        return res.end("aws-chunked не поддерживается заглушкой");
      }
      objects.set(key, {
        body,
        contentType: req.headers["content-type"] as string | undefined,
        metadata: meta(),
        sse: req.headers["x-amz-server-side-encryption"] as string | undefined,
        lastModified: new Date(),
      });
      res.setHeader("etag", etag(body));
      return res.end();
    }

    if (req.method === "DELETE") {
      objects.delete(key);
      res.statusCode = 204;
      return res.end();
    }

    if (req.method === "GET" || req.method === "HEAD") {
      const presigned = url.searchParams.has("X-Amz-Signature");
      if (presigned && !(await presignOk(url))) {
        res.statusCode = 403;
        return res.end(xml("<Error><Code>SignatureDoesNotMatch</Code></Error>"));
      }
      if (req.method === "GET" && !presigned && stub.beforeGet && (await stub.beforeGet(key, req.headers.range))) {
        res.statusCode = 403;
        return res.end(xml("<Error><Code>AccessDenied</Code></Error>"));
      }
      const o = objects.get(key);
      if (!o) {
        res.statusCode = 404;
        return res.end(req.method === "HEAD" ? undefined : xml("<Error><Code>NoSuchKey</Code></Error>"));
      }
      const ifMatch = req.headers["if-match"];
      if (ifMatch && ifMatch !== etag(o.body)) {
        res.statusCode = 412;
        return res.end(req.method === "HEAD" ? undefined : xml("<Error><Code>PreconditionFailed</Code></Error>"));
      }
      res.setHeader("etag", etag(o.body));
      res.setHeader("last-modified", o.lastModified.toUTCString());
      res.setHeader("accept-ranges", "bytes");
      if (o.sse) res.setHeader("x-amz-server-side-encryption", o.sse);
      for (const [k, v] of Object.entries(o.metadata)) res.setHeader(`x-amz-meta-${k}`, v);
      res.setHeader("content-type", url.searchParams.get("response-content-type") ?? o.contentType ?? "application/octet-stream");
      const disposition = url.searchParams.get("response-content-disposition");
      if (disposition) res.setHeader("content-disposition", disposition);
      const cacheControl = url.searchParams.get("response-cache-control");
      if (cacheControl) res.setHeader("cache-control", cacheControl);

      let start = 0;
      let end = o.body.length - 1;
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
      if (range) {
        if (range[1] === "") start = Math.max(0, o.body.length - Number(range[2]));
        else {
          start = Number(range[1]);
          if (range[2] !== "") end = Math.min(end, Number(range[2]));
        }
        if (start > end) {
          res.statusCode = 416;
          return res.end();
        }
        res.statusCode = 206;
        res.setHeader("content-range", `bytes ${start}-${end}/${o.body.length}`);
      }
      res.setHeader("content-length", String(end - start + 1));
      return res.end(req.method === "HEAD" ? undefined : o.body.subarray(start, end + 1));
    }

    res.statusCode = 501;
    res.end();
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as net.AddressInfo).port;
      resolve();
    });
  });
  const endpoint = `http://127.0.0.1:${port}`;

  return Object.assign(stub, {
    objects,
    endpoint,
    bucket,
    accessKey,
    secretKey,
    region,
    env: (extra = {}) => ({
      S3_BUCKET: bucket,
      S3_ACCESS_KEY: accessKey,
      S3_SECRET_KEY: secretKey,
      S3_ENDPOINT: endpoint,
      S3_REGION: region,
      S3_FORCE_PATH_STYLE: "1",
      ...extra,
    }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
}

import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { uploadParts } from "../../../legacy/legacy.js";

type Stream = { update: (d: Buffer) => Buffer; final: () => Buffer };
const run = (s: Stream, data: Buffer) => Buffer.concat([s.update(data), s.final()]);

describe("server/lib/uploadParts.js через мост", () => {
  it("части с любых смещений (в том числе посреди блока и с переносом счётчика) дают тот же шифротекст, что целиком", () => {
    const { partCipherAt } = uploadParts();
    const key = crypto.randomBytes(32);
    const iv = Buffer.alloc(16, 0xff); // перенос через все байты счётчика
    const data = crypto.randomBytes(1000);
    const whole = run(partCipherAt(key, iv, 0), data);
    const cuts = [0, 7, 16, 33, 512, 999, 1000];
    const parts = cuts.slice(0, -1).map((from, i) => run(partCipherAt(key, iv, from), data.subarray(from, cuts[i + 1])));
    expect(Buffer.concat(parts).equals(whole)).toBe(true);
    expect(run(partCipherAt(key, iv, 0, "decipher"), whole).equals(data)).toBe(true);
  });
});

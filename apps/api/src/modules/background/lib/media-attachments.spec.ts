// Какие вложения ждут фоновой обработки, обязано совпадать с server/lib/mediaJobs.js:
// задачу ставит любой из бэкендов, а пометку previewPending видит клиент. Старый модуль
// при загрузке открывает базу (cwd/data), поэтому он считает в отдельном процессе.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Attachment } from "../../../legacy/legacy.js";
import { markPendingPreviews, messageNeedsMedia, storyNeedsMedia } from "./media-attachments.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const NAME = "image_0123456789abcdef.png";

const ATTACHMENTS: Attachment[][] = [
  [],
  [{ kind: "image", url: `/uploads/${NAME}` }],
  [{ kind: "image", url: `/uploads/${NAME}`, thumbUrl: "/uploads/x" }],
  [{ kind: "video", url: `/uploads/${NAME}` }],
  [{ kind: "video", url: `/uploads/${NAME}`, previewUrl: "/uploads/p" }],
  [{ kind: "video", url: `/uploads/${NAME}`, thumbUrl: "/uploads/t" }],
  [{ kind: "image", url: "https://example.com/a.png" }],
  [{ kind: "image", url: "/uploads/../secret" }],
  [{ kind: "image", url: "/uploads/IMAGE_0123456789abcdef.png" }],
  [{ kind: "file", url: `/uploads/${NAME}`, mimeType: "image/png" }],
  [{ kind: "voice", url: `/uploads/${NAME}` }],
  [{ kind: "voice", url: `/uploads/${NAME}`, durationSec: 3.2 }],
  [{ kind: "voice", url: `/uploads/${NAME}`, durationSec: 0 }],
  [{ kind: "video-note", url: `/uploads/${NAME}`, durationSec: -1 }],
  [{ kind: "file", url: `/uploads/${NAME}`, mimeType: "audio/ogg" }],
  [{ kind: "file", url: `/uploads/${NAME}`, mimeType: "video/mp4" }],
  [{ kind: "voice", url: "https://example.com/v.ogg" }],
  [{ kind: "image", url: 5 as unknown as string }],
  [{ kind: "sticker", url: `/uploads/${NAME}` }, { kind: "image", url: `/uploads/${NAME}` }],
];
const STORIES = [
  { items: [{ kind: "image", url: `/uploads/${NAME}` }] },
  { items: [{ kind: "video", url: `/uploads/${NAME}` }] },
  { items: [{ kind: "video", url: `/uploads/${NAME}`, previewUrl: "/uploads/p" }] },
  { items: [{ kind: "video", url: "https://example.com/v.mp4" }] },
  { items: [{ kind: "image", url: "/uploads/a" }, { kind: "video", url: "/uploads/anything" }] },
];

const SCRIPT = `
const m = require(${JSON.stringify(path.join(REPO_ROOT, "server", "lib", "mediaJobs.js"))});
const attachments = ${JSON.stringify(ATTACHMENTS)};
const out = {
  marked: [...attachments, undefined].map((list) => m.markPendingPreviews(list) ?? null),
  needs: attachments.map((list) => m.messageNeedsMedia({ attachments: list })),
  noAttachments: m.messageNeedsMedia({}),
  stories: ${JSON.stringify(STORIES)}.map((s) => m.storyNeedsMedia(s)),
};
require("fs").writeFileSync(process.env.OUT, JSON.stringify(out));
process.exit(0);
`;

let dir: string;
let legacy: Record<string, unknown>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "shalter-media-"));
  fs.mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "out.json");
  execFileSync(process.execPath, ["-e", SCRIPT], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: "test", OUT: out }, stdio: "ignore" });
  legacy = JSON.parse(fs.readFileSync(out, "utf8"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("вложения для фоновой обработки совпадают с server/lib/mediaJobs.js", () => {
  it("previewPending", () => {
    expect([...ATTACHMENTS, undefined].map((list) => markPendingPreviews(list) ?? null)).toEqual(legacy.marked);
  });

  it("нужна ли задача сообщению и истории", () => {
    expect(ATTACHMENTS.map((list) => messageNeedsMedia({ attachments: list }))).toEqual(legacy.needs);
    expect(messageNeedsMedia({})).toBe(legacy.noAttachments);
    expect(STORIES.map(storyNeedsMedia)).toEqual(legacy.stories);
  });
});

import { describe, expect, it } from "vitest";

import { checkSize, chunks, fileKind, uploadActionFor } from "./files";

describe("файлы для отправки", () => {
  it("вид по MIME: аудио и прочее — файлом", () => {
    expect(fileKind({ type: "image/jpeg" })).toBe("image");
    expect(fileKind({ type: "video/mp4" })).toBe("video");
    expect(fileKind({ type: "audio/mpeg" })).toBe("file");
    expect(fileKind({ type: "" })).toBe("file");
  });

  it("лимит 5 ГБ, действие для шапки, пачки по 10", () => {
    expect(checkSize({ size: 1024 }, "image")).toBeNull();
    expect(checkSize({ size: 6 * 1024 ** 3 }, "video")).toBe("Видео слишком большой: 6.00 ГБ из максимальных 5 ГБ");
    expect(uploadActionFor(["image", "image"])).toBe("upload_photo");
    expect(uploadActionFor(["image", "video"])).toBe("upload_video");
    expect(uploadActionFor(["file"])).toBe("upload_document");
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadMany } from "./download-many";

describe("downloadMany", () => {
  afterEach(() => vi.restoreAllMocks());

  it("запускает скачивание каждого файла и сохраняет имена", async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });

    await expect(downloadMany([{ url: "/uploads/one.jpg", name: "Фото.jpg" }, { url: "/uploads/two.pdf" }])).resolves.toBe(2);
    expect(clicked).toEqual(["Фото.jpg", "two.pdf"]);
  });
});

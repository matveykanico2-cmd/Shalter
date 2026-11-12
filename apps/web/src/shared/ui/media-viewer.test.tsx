import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaViewer } from "./media-viewer";

afterEach(cleanup);

/** jsdom не декодирует видео: videoWidth/videoHeight задаём сами. */
function videoMeta(width: number) {
  const video = document.querySelector("video")!;
  Object.defineProperty(video, "videoWidth", { configurable: true, value: width });
  Object.defineProperty(video, "videoHeight", { configurable: true, value: width ? 720 : 0 });
  vi.spyOn(video, "pause").mockImplementation(() => {});
  fireEvent.loadedMetadata(video);
  fireEvent.loadedData(video);
  return video;
}

describe("просмотр медиа", () => {
  it("видео без картинки (кодек HEVC): сначала запасной адрес, потом объяснение и «Скачать», а не чёрный экран", () => {
    render(<MediaViewer items={[{ kind: "video", url: "/uploads/preview.mp4", fallbackUrl: "/uploads/original.mov", name: "clip.mov" }]} index={0} onClose={() => {}} />);
    videoMeta(0);
    expect(document.querySelector("video")?.getAttribute("src")).toBe("/uploads/original.mov");
    videoMeta(0);
    expect(screen.getByRole("alert").textContent).toContain("не умеет показывать видео");
    expect(within(screen.getByRole("alert")).getByRole("link", { name: "Скачать" }).getAttribute("href")).toBe("/uploads/preview.mp4");
  });

  it("сжатая копия ещё готовится — так и пишем, с «Повторить»", () => {
    render(<MediaViewer items={[{ kind: "video", url: "/uploads/original.mov", processing: true }]} index={0} onClose={() => {}} />);
    videoMeta(0);
    expect(screen.getByRole("alert").textContent).toContain("ещё обрабатывается");
    expect(screen.getByRole("button", { name: "Повторить" })).toBeTruthy();
  });

  it("обычное видео играет без сообщений", () => {
    render(<MediaViewer items={[{ kind: "video", url: "/uploads/ok.mp4" }]} index={0} onClose={() => {}} />);
    videoMeta(1280);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("Загрузка")).toBeNull();
  });

  it("фото, которое браузер не открыл (HEIC), — показываем превью из ленты", () => {
    render(<MediaViewer items={[{ kind: "image", url: "/uploads/photo.heic", thumbUrl: "/uploads/photo_thumb.jpg" }]} index={0} onClose={() => {}} />);
    const img = () => [...document.querySelectorAll("img")].at(-1)!;
    fireEvent.error(img());
    expect(img().getAttribute("src")).toBe("/uploads/photo_thumb.jpg");
  });
});

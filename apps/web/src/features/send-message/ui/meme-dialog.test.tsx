import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemeDialog } from "./meme-dialog";

/** Картинка, которая «загружается» сразу (в jsdom изображения не грузятся). */
class LoadedImage {
  naturalWidth = 400;
  naturalHeight = 300;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  vi.stubGlobal("Image", LoadedImage);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:meme", revokeObjectURL: () => {} }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["jpg"], { type: "image/jpeg" })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("мем (memeDialog.js)", () => {
  it("картинка → подписи → Enter во втором поле отправляет JPEG", async () => {
    const onDone = vi.fn();
    render(<MemeDialog onDone={onDone} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Отправить" })).toBeNull();
    fireEvent.change(screen.getByTestId("meme-file"), { target: { files: [new File(["x"], "cat.png", { type: "image/png" })] } });
    const top = await screen.findByRole("textbox", { name: "Верхний текст" });
    expect(screen.getByRole("button", { name: "Выбрать другую картинку" })).toBeTruthy();
    fireEvent.change(top, { target: { value: "когда" } });
    fireEvent.keyDown(top, { key: "Enter" });
    const bottom = screen.getByRole("textbox", { name: "Нижний текст" });
    expect(document.activeElement).toBe(bottom);
    fireEvent.change(bottom, { target: { value: "пятница" } });
    fireEvent.keyDown(bottom, { key: "Enter" });
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const file = onDone.mock.calls[0]![0] as File;
    expect([file.name, file.type]).toEqual(["meme.jpg", "image/jpeg"]);
  });
});

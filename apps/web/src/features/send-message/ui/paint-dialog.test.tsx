import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaintDialog } from "./paint-dialog";

beforeEach(() => {
  // В jsdom нет canvas: рисование — пустые вызовы, результат — PNG-заглушка.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["png"], { type: "image/png" })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("рисовалка (paintDialog.js)", () => {
  it("инструменты и цвета переключаются; «Готово» отдаёт PNG и закрывает окно", async () => {
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(<PaintDialog onDone={onDone} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Рисунок" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "◯ Овал" }));
    expect(screen.getByRole("button", { name: "◯ Овал" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "✏️ Карандаш" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "#ff5d73" }));
    expect(screen.getByRole("button", { name: "#ff5d73" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("slider", { name: "Толщина" }), { target: { value: "30" } });
    expect(screen.getByText("30")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const file = onDone.mock.calls[0]![0] as File;
    expect([file.name, file.type]).toEqual(["paint.png", "image/png"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("заголовок — свой у стикера", () => {
    render(<PaintDialog title="Нарисовать стикер" onDone={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Нарисовать стикер" })).toBeTruthy();
  });
});

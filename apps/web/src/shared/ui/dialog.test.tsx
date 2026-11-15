import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "./dialog";

describe("Dialog", () => {
  it("закрывается завершённым кликом и не передаёт тап кнопке под overlay", () => {
    const below = vi.fn();
    const close = vi.fn();
    render(
      <>
        <button type="button" onClick={below}>Под окном</button>
        <Dialog title="Поверх" onClose={close}>
          <p>Содержимое</p>
        </Dialog>
      </>
    );

    const dialog = screen.getByRole("dialog", { name: "Поверх" });
    const overlay = dialog.parentElement!;
    // Pointerdown не размонтирует портал под ещё не завершившимся тапом.
    fireEvent.pointerDown(overlay);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(overlay);
    expect(close).toHaveBeenCalledTimes(1);
    expect(below).not.toHaveBeenCalled();
  });
});

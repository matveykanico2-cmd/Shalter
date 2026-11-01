import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Menu } from "./menu";

afterEach(cleanup);

describe("Menu", () => {
  it("отпускание пальца, которым меню открыли удержанием, пункт не нажимает", () => {
    const reply = vi.fn();
    const onClose = vi.fn();
    render(<Menu at={{ x: 10, y: 10 }} items={[{ label: "Ответить", onClick: reply }]} onClose={onClose} />);
    const item = screen.getByRole("button", { name: "Ответить" });
    // click от отпускания: нажатие началось до появления меню, вне его.
    fireEvent.click(item, { detail: 1 });
    expect(reply).not.toHaveBeenCalled();
    // Обычное нажатие по пункту.
    fireEvent.pointerDown(item);
    fireEvent.click(item, { detail: 1 });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it("клавиатура (detail 0) срабатывает всегда", () => {
    const reply = vi.fn();
    render(<Menu at={{ x: 10, y: 10 }} items={[{ label: "Ответить", onClick: reply }]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ответить" }), { detail: 0 });
    expect(reply).toHaveBeenCalledTimes(1);
  });
});

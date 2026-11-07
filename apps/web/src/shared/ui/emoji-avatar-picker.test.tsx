import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmojiAvatarPicker } from "./emoji-avatar-picker";

afterEach(cleanup);

describe("EmojiAvatarPicker", () => {
  it("смайл из сетки выбирается вместе с фоном", () => {
    const onPick = vi.fn();
    render(<EmojiAvatarPicker onPick={onPick} />);
    const grid = screen.getByRole("group", { name: "Смайл на аватарке" });
    expect(grid.querySelectorAll("button").length).toBeGreaterThan(10);
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(onPick).toHaveBeenCalledWith("🔥", "#1e88e5");
  });

  it("фон меняется, ручного ввода смайла нет", () => {
    const onPick = vi.fn();
    render(<EmojiAvatarPicker onPick={onPick} />);
    expect(screen.queryByRole("textbox", { name: "Свой смайл" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Фон 1" }));
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(onPick).toHaveBeenCalledWith("🔥", "#e53935");
  });
});

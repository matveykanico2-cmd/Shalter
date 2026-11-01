import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmojiAvatarPicker } from "./emoji-avatar-picker";
import { Toaster } from "./toast";

afterEach(cleanup);

describe("EmojiAvatarPicker", () => {
  it("смайл из сетки — сразу onPick", () => {
    const onPick = vi.fn();
    render(<EmojiAvatarPicker onPick={onPick} />);
    const grid = screen.getByRole("group", { name: "Смайл на аватарке" });
    expect(grid.querySelectorAll("button").length).toBeGreaterThan(10);
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(onPick).toHaveBeenCalledWith("🔥");
  });

  it("свой смайл: склейка годится, буква и два смайла — нет", async () => {
    const onPick = vi.fn();
    render(
      <>
        <EmojiAvatarPicker onPick={onPick} />
        <Toaster />
      </>
    );
    const input = screen.getByRole("textbox", { name: "Свой смайл" });
    const apply = screen.getByRole("button", { name: "Установить" });

    fireEvent.change(input, { target: { value: "Ж" } });
    fireEvent.click(apply);
    expect(await screen.findByText("Некорректный эмодзи")).toBeTruthy();

    fireEvent.change(input, { target: { value: "🔥🔥" } });
    fireEvent.click(apply);
    expect(await screen.findByText("Один смайл")).toBeTruthy();
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: " 👨‍👩‍👧 " } });
    fireEvent.click(apply);
    expect(onPick).toHaveBeenCalledWith("👨‍👩‍👧");
  });

  it("заставка группы: в своё поле можно и букву", () => {
    const onPick = vi.fn();
    render(<EmojiAvatarPicker onPick={onPick} emojiOnly={false} label="Смайл на заставке" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Свой смайл" }), { target: { value: "Ж" } });
    fireEvent.click(screen.getByRole("button", { name: "Установить" }));
    expect(onPick).toHaveBeenCalledWith("Ж");
  });
});

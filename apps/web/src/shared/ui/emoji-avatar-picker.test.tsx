import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AvatarBackgroundPicker } from "./avatar-editor";
import { EmojiAvatarPicker } from "./emoji-avatar-picker";

afterEach(cleanup);

describe("EmojiAvatarPicker", () => {
  it("смайл из сетки выбирается независимо от фона", () => {
    const onPick = vi.fn();
    render(<EmojiAvatarPicker onPick={onPick} />);
    const grid = screen.getByRole("group", { name: "Смайл на аватарке" });
    expect(grid.querySelectorAll("button").length).toBeGreaterThan(10);
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(onPick).toHaveBeenCalledWith("🔥");
  });

  it("не показывает фон и ручной ввод внутри меню смайлов", () => {
    const onPick = vi.fn();
    render(<EmojiAvatarPicker onPick={onPick} />);
    expect(screen.queryByRole("textbox", { name: "Свой смайл" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Фон аватарки" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(onPick).toHaveBeenCalledWith("🔥");
  });
  it("выбирает прозрачность отдельно от смайла", () => {
    const onColor = vi.fn();
    render(<AvatarBackgroundPicker color="#1e88e5" onPick={onColor} />);
    fireEvent.click(screen.getByRole("radio", { name: "Прозрачный фон" }));
    expect(onColor).toHaveBeenCalledWith("transparent");
  });
});

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Avatar } from "./avatar";

afterEach(cleanup);

describe("Avatar", () => {
  it("смайл важнее фото: у профиля фото остаются в галерее, а на аватарке — смайл", () => {
    const { container } = render(<Avatar name="Аня" image="/a.png" emoji="🌻" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("🌻");
  });

  it("без смайла — фото, без фото — инициалы", () => {
    const { container, rerender } = render(<Avatar name="Аня Петрова" image="/a.png" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/a.png");
    rerender(<Avatar name="Аня Петрова" />);
    expect(container.textContent).toBe("АП");
  });
});

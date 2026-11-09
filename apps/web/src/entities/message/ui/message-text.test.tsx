import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { MessageText } from "./message-text";

const view = (text: string) =>
  render(
    <MemoryRouter>
      <MessageText text={text} />
    </MemoryRouter>,
  );

describe("MessageText", () => {
  it("рисует базовый markdown обычного сообщения", () => {
    view("## План\n- **важно**\n- *срочно*\n1. `код`\n[сайт](https://example.test)");

    expect(screen.getByRole("heading", { name: "План" })).toBeTruthy();
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByText("важно").tagName).toBe("B");
    expect(screen.getByText("срочно").tagName).toBe("I");
    expect(screen.getByText("код").tagName).toBe("CODE");
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: "сайт" }).getAttribute("href")).toBe("https://example.test");
  });

  it("экранирует HTML и не создаёт ссылку для javascript-схемы", () => {
    const { container } = view('<img src=x onerror=alert(1)> [опасно](javascript:alert(1)) <script>alert(2)</script>');

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert/)).toBeTruthy();
  });
});

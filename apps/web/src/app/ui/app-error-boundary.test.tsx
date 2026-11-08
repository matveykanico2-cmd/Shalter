import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "./app-error-boundary";

function Broken(): never {
  throw new Error("test crash");
}

afterEach(() => vi.restoreAllMocks());

describe("AppErrorBoundary", () => {
  it("заменяет упавший экран безопасным перезапуском", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Не удалось открыть экран"));
    expect(screen.getByRole("button", { name: "Перезапустить" })).toBeTruthy();
  });
});

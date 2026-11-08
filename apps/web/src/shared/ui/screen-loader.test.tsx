import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenLoader } from "./screen-loader";

describe("ScreenLoader", () => {
  it("показывает доступное состояние загрузки", () => {
    render(<ScreenLoader />);

    expect(screen.getByRole("status", { name: "Загрузка" })).toBeTruthy();
    expect(screen.getByText("Загрузка…")).toBeTruthy();
  });
});

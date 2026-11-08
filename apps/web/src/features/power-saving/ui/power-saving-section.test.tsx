import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePowerSavingRuntime } from "@/shared/lib/power-saving";

import { PowerSavingSection } from "./power-saving-section";

function Subject() {
  usePowerSavingRuntime();
  return <PowerSavingSection />;
}

describe("энергосбережение", () => {
  it("включается постоянно и применяет выбранные ограничения ко всему клиенту", async () => {
    render(<Subject />);
    fireEvent.change(screen.getByRole("combobox", { name: "Режим энергосбережения" }), { target: { value: "always" } });

    await waitFor(() => expect(document.documentElement.hasAttribute("data-power-saving-motion")).toBe(true));
    expect(document.documentElement.hasAttribute("data-power-saving-autoplay")).toBe(true);
    expect(document.documentElement.hasAttribute("data-power-saving-effects")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Эффекты сообщений/ }));
    await waitFor(() => expect(document.documentElement.hasAttribute("data-power-saving-effects")).toBe(false));
  });
});

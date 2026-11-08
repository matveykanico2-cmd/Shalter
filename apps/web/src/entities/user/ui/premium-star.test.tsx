import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PremiumStar } from "./premium-star";

describe("PremiumStar", () => {
  it("заполняет толщину звезды при 3D-повороте", () => {
    render(<PremiumStar />);

    const star = screen.getByRole("button", { name: "Shalter Premium" });
    expect(star.querySelectorAll("span")).toHaveLength(8); // сцена, задняя и передняя грани, 5 слоёв толщины
  });
});

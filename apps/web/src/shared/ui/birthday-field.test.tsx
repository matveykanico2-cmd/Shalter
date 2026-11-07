import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BirthdayField } from "./birthday-field";

afterEach(cleanup);

describe("BirthdayField", () => {
  it("выбирает день, месяц и год без ручного ввода", () => {
    const onChange = vi.fn();
    render(<BirthdayField onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "День рождения" }), { target: { value: "25" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Месяц рождения" }), { target: { value: "12" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Год рождения" }), { target: { value: "1990" } });
    expect(onChange).toHaveBeenLastCalledWith("1990-12-25", null);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("правильно ограничивает февраль високосного года", () => {
    render(<BirthdayField value="2024-02-29" onChange={vi.fn()} />);
    expect((screen.getByRole("combobox", { name: "День рождения" }) as HTMLSelectElement).value).toBe("29");
    expect(screen.getAllByRole("option", { name: "29" })).toHaveLength(1);
  });
});

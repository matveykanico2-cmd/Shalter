import { beforeEach, describe, expect, it, vi } from "vitest";

import { addContact, matchContacts } from "../api/contacts";

import { matchAndAddAll } from "./contact-sync";

vi.mock("../api/contacts", () => ({
  addContact: vi.fn(),
  matchContacts: vi.fn(),
}));

const found = (phone: string) => ({
  phone,
  localName: "Лена",
  alreadyContact: false,
  user: { id: "u_lena00000", name: "Елена" },
});

beforeEach(() => vi.clearAllMocks());

describe("синхронизация телефонной книги", () => {
  it("автоматически добавляет найденного человека один раз и выбирает все его номера", async () => {
    const first = found("+79990000001");
    const second = found("+79990000002");
    vi.mocked(matchContacts).mockResolvedValue({ found: [first, second], notFound: [], checked: 2 } as never);
    vi.mocked(addContact).mockResolvedValue({} as never);

    const result = await matchAndAddAll([{ name: "Лена", phone: first.phone }, { name: "Лена", phone: second.phone }]);

    expect(addContact).toHaveBeenCalledTimes(1);
    expect(addContact).toHaveBeenCalledWith("u_lena00000", "Лена");
    expect(result.added).toBe(1);
    expect(result.found.every((entry) => entry.justAdded)).toBe(true);
  });
});

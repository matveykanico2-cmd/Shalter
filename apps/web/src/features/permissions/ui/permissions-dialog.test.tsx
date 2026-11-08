import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { PermissionsDialog } from "./permissions-dialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "contacts");
  Reflect.deleteProperty(window, "ContactsManager");
});

describe("PermissionsDialog", () => {
  it("сверяет выбранные номера и сразу добавляет найденных", async () => {
    Object.defineProperty(window, "ContactsManager", { configurable: true, value: class {} });
    Object.defineProperty(navigator, "contacts", {
      configurable: true,
      value: { select: vi.fn().mockResolvedValue([{ name: ["Борис"], tel: ["+7 999 111-22-33"] }]) },
    });
    const { calls } = fakeApi({
      "POST /api/contacts/match": { body: { found: [{ user: { id: "u_boris" }, localName: "Борис", alreadyContact: false }], notFound: [], checked: 1 } },
      "POST /api/contacts": { body: { ok: true } },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PermissionsDialog onClose={() => {}} />
      </QueryClientProvider>
    );

    const row = screen.getByText("Контакты").closest("div")!.parentElement!;
    fireEvent.click(row.querySelector("button")!);

    await waitFor(() => expect(screen.getByLabelText("Разрешено")).toBeTruthy());
    expect(calls.find((call) => call.key === "POST /api/contacts/match")?.body).toEqual({ contacts: [{ name: "Борис", phone: "+7 999 111-22-33" }] });
    expect(calls.find((call) => call.key === "POST /api/contacts")?.body).toEqual({ userId: "u_boris", localName: "Борис", sharePhone: false });
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { EditContactDialog } from "./edit-contact-dialog";

afterEach(cleanup);

const BORIS = { id: "u_boris0000", name: "Борис", avatarColor: "#5b8def", avatarImage: "/uploads/boris.jpg", avatarEmoji: null };

function renderDialog(photo: string | null, user: Record<string, unknown> = {}) {
  const onSaved = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EditContactDialog
        user={{ ...BORIS, ...user }}
        contactName={null}
        note={null}
        photo={photo}
        openDm={async () => "c_dm"}
        onSaved={onSaved}
        onClose={() => {}}
      />
    </QueryClientProvider>
  );
  return { onSaved };
}

const routes = {
  "GET /api/stickers/packs": { body: { packs: [] } },
  "POST /api/contacts/rename": { body: { contact: {} } },
  "POST /api/contacts/note": { body: { note: null } },
  "POST /api/contacts/photo": { body: { localAvatar: "emoji:🔥" } },
};

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api");
  return { ...actual, uploadFile: vi.fn(async () => ({ kind: "avatar", url: "/uploads/local-contact.jpg" })) };
});

describe("EditContactDialog: свой смайл контакта", () => {
  it("показывает загруженное фото вместо буквенного fallback и применяет выбранный фон", async () => {
    const { calls } = fakeApi(routes);
    renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Установить фото, видео или GIF для Борис" }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["image"], "avatar.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(document.querySelector('img[src="/uploads/local-contact.jpg"]')).toBeTruthy());
    fireEvent.click(screen.getByRole("radio", { name: "Фон 2" }));
    expect(screen.getByRole("radio", { name: "Фон 2" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(calls.find((c) => c.key === "POST /api/contacts/photo")?.body).toMatchObject({ url: "/uploads/local-contact.jpg" }));
  });

  it("смайл из сетки уходит в /api/contacts/photo как emoji", async () => {
    const { calls } = fakeApi(routes);
    const { onSaved } = renderDialog(null);
    fireEvent.click(screen.getByRole("button", { name: "Установить смайл для Борис" }));
    fireEvent.click(screen.getByRole("button", { name: "🔥" }));
    expect(screen.getByRole("button", { name: "Убрать свой смайл" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.find((c) => c.key === "POST /api/contacts/photo")?.body).toEqual({ userId: BORIS.id, emoji: "🔥" });
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ photo: "emoji:🔥" });
  });

  it("поставленный смайл убирается — пустая ссылка", async () => {
    const { calls } = fakeApi(routes);
    const { onSaved } = renderDialog("emoji:🐱", { avatarEmoji: "🐱", profileAvatarEmoji: null });
    fireEvent.click(screen.getByRole("button", { name: "Убрать свой смайл" }));
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.find((c) => c.key === "POST /api/contacts/photo")?.body).toEqual({ userId: BORIS.id, url: "" });
  });

  it("без изменений аватарки фото контакта не отправляется", async () => {
    const { calls } = fakeApi(routes);
    const { onSaved } = renderDialog("emoji:🐱", { avatarEmoji: "🐱", profileAvatarEmoji: null });
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.some((c) => c.key === "POST /api/contacts/photo")).toBe(false);
  });
});

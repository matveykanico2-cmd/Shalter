import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AvatarViewer } from "./avatar-viewer";

afterEach(cleanup);

const callbacks = { canEdit: false, onChange: vi.fn(), onClose: vi.fn() };

describe("AvatarViewer", () => {
  it("показывает активный смайл с фоном, а старые фотографии оставляет дальше", () => {
    render(
      <AvatarViewer
        {...callbacks}
        user={{
          name: "Борис",
          avatarEmoji: "🔥",
          avatarColor: "#e53935",
          avatarImage: "/uploads/old.jpg",
          avatarImages: [{ kind: "image", url: "/uploads/old.jpg" }],
        }}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Фото профиля" });
    expect(dialog.textContent).toContain("🔥");
    expect(within(dialog).queryByRole("img", { name: "Борис" })).toBeNull();
    expect(dialog.querySelector('[style*="background: rgb(229, 57, 53)"]')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее" }));
    expect(within(dialog).getByRole("img", { name: "Борис" }).getAttribute("src")).toBe("/uploads/old.jpg");
  });

  it("добавляет личную фотографию контакта первой только в локальный просмотр", () => {
    render(
      <AvatarViewer
        {...callbacks}
        user={{
          name: "Борис",
          avatarImage: "/uploads/contact-only.jpg",
          avatarImages: [{ kind: "image", url: "/uploads/public.jpg" }],
        }}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Фото профиля" });
    expect(within(dialog).getByRole("img", { name: "Борис" }).getAttribute("src")).toBe("/uploads/contact-only.jpg");
    fireEvent.click(within(dialog).getByRole("button", { name: "Следующее" }));
    expect(within(dialog).getByRole("img", { name: "Борис" }).getAttribute("src")).toBe("/uploads/public.jpg");
  });

  it("открывает инициалы как полноценную аватарку", () => {
    render(<AvatarViewer {...callbacks} user={{ name: "Борис Иванов", avatarColor: "#1e88e5" }} />);
    expect(within(screen.getByRole("dialog", { name: "Фото профиля" })).getByText("БИ")).toBeTruthy();
  });
});

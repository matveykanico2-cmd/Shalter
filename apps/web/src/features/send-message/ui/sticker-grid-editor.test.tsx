import type { Sticker } from "@shalter/shared/schemas/stickers";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import type { StickerPack } from "../api/sticker-packs";

import { StickerGridEditor } from "./sticker-pack-detail";

vi.mock("@/shared/lib/anim", async (orig) => ({ ...(await orig<object>()), renderSticker: () => document.createElement("span") }));

const sticker = (id: string, emoji: string, position: number): Sticker => ({
  id,
  packId: "sp_me_abc",
  url: `/uploads/${id}.webp`,
  emoji,
  position,
  createdAt: "2026-11-12T10:00:00.000Z",
});
const pack = (): StickerPack => ({
  id: "sp_me_abc",
  ownerId: "u_me",
  name: "Коты",
  description: null,
  stickers: [sticker("st_0000000a", "🐱", 0), sticker("st_0000000b", "🐶", 1)],
  stickerCount: 2,
  isAdded: true,
  isOwner: true,
  coverStickerId: null,
  cover: "/uploads/st_0000000a.webp",
  createdAt: "2026-11-12T10:00:00.000Z",
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("редактор стикерпака", () => {
  it("5 в ряд, крупные действия у выбранного; после перестановки обложка — новый первый, список перечитывается после сохранения", async () => {
    const { calls } = fakeApi({
      "PATCH /api/stickers/packs/sp_me_abc/stickers/st_0000000a": (b) => ({ body: { sticker: sticker("st_0000000a", "🐱", Number(b.position)) } }),
      "PATCH /api/stickers/packs/sp_me_abc/stickers/st_0000000b": (b) => ({ body: { sticker: sticker("st_0000000b", "🐶", Number(b.position)) } }),
    });
    const onChange = vi.fn();
    render(<StickerGridEditor pack={pack()} onChange={onChange} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Стикер 🐱, обложка" })).toBeTruthy();
    // Без выбора — панели действий нет.
    expect(screen.queryByRole("button", { name: "Позже" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Стикер 🐱, обложка" }));
    fireEvent.click(screen.getByRole("button", { name: "Позже" }));
    // Сразу на экране, без перечитывания.
    expect(onChange).toHaveBeenNthCalledWith(1, expect.objectContaining({ cover: "/uploads/st_0000000b.webp" }), false);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cover: "/uploads/st_0000000b.webp" }), true);
    expect(calls.map((c) => c.body)).toEqual(expect.arrayContaining([{ position: 0 }, { position: 1 }]));
  });
});

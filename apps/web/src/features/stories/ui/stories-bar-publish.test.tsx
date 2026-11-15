import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SelfUser } from "@/entities/session";

import { fakeApi } from "@/shared/lib/test";

import { StoriesBar } from "./stories-bar";

const postStory = vi.fn();

vi.mock("../model/post-story", () => ({
  postStory: (...args: unknown[]) => postStory(...args),
  postTextStory: vi.fn(),
}));

const ME = { id: "u_me0000000", name: "Аня", avatarColor: "#3390ec", avatarImage: null } as unknown as SelfUser;

beforeEach(() => {
  postStory.mockReset();
  fakeApi({ "GET /api/stories": { body: { groups: [] } } });
});

describe("публикация истории", () => {
  it("двойной тап запускает одну публикацию и один редактор", async () => {
    postStory.mockImplementation(async (_files, hooks) => {
      const edited = await hooks.edit(new File(["photo"], "photo.jpg", { type: "image/jpeg", lastModified: 1 }));
      return !!edited;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <StoriesBar me={ME} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /Выложить историю$/ }));
    fireEvent.click(screen.getByRole("button", { name: /История$/ }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["photo"], "photo.jpg", { type: "image/jpeg", lastModified: 1 })] } });

    const publish = await screen.findByRole("button", { name: "Опубликовать историю" });
    fireEvent.click(publish);
    fireEvent.click(publish);

    const editor = await screen.findByRole("dialog", { name: "Редактор истории" });
    expect(postStory).toHaveBeenCalledTimes(1);
    fireEvent.click(within(editor).getByRole("button", { name: "Пропустить" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Редактор истории" })).toBeNull());
    expect(postStory).toHaveBeenCalledTimes(1);
  });
});

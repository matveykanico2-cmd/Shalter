import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi } from "@/shared/lib/test";

import { NearbyView } from "./nearby-view";

const BORIS = { id: "u_boris0000", name: "Борис", username: "boris", avatarColor: null, avatarImage: null, label: "1–3 км" };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Люди рядом»", () => {
  it("показ включается по местоположению, список обновляется при движении; «Перестать показывать меня»", async () => {
    let onMove: ((pos: GeolocationPosition) => void) | null = null;
    const clearWatch = vi.fn();
    const pos = (latitude: number) => ({ coords: { latitude, longitude: 37.61 } }) as GeolocationPosition;
    vi.stubGlobal("navigator", {
      ...navigator,
      geolocation: {
        getCurrentPosition: (ok: (p: GeolocationPosition) => void) => ok(pos(55.75)),
        watchPosition: (ok: (p: GeolocationPosition) => void) => {
          onMove = ok;
          return 7;
        },
        clearWatch,
      },
    });
    let users: (typeof BORIS)[] = [];
    const { calls } = fakeApi({ "POST /api/nearby": () => ({ body: { users } }), "DELETE /api/nearby": { body: { ok: true } } });
    const router = createMemoryRouter(
      [
        { path: "/nearby", element: <NearbyView /> },
        { path: "/contacts", element: <p>контакты</p> },
      ],
      { initialEntries: ["/nearby"] }
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("heading", { name: "Люди рядом" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Показать, кто рядом" }));
    expect(await screen.findByText("Пока рядом никого не видно")).toBeTruthy();
    expect(calls.find((c) => c.key === "POST /api/nearby")?.body).toEqual({ lat: 55.75, lng: 37.61 });

    users = [BORIS];
    onMove!(pos(55.751));
    expect(await screen.findByText("Борис")).toBeTruthy();
    expect(screen.getByText("1–3 км")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Перестать показывать меня" }));
    expect(await screen.findByRole("button", { name: "Показать, кто рядом" })).toBeTruthy();
    expect(screen.queryByText("Борис")).toBeNull();
    expect(clearWatch).toHaveBeenCalledWith(7);
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /api/nearby")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/contacts"));
  });
});

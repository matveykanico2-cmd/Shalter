import { createBrowserRouter } from "react-router";

import { HomeView } from "@/views/home";

import { GuestOnly, RequireSession } from "./ui/session-gate";

export const createRouter = () =>
  createBrowserRouter([
    { path: "/login", element: <GuestOnly /> },
    {
      element: <RequireSession />,
      children: [
        { index: true, element: <HomeView /> },
        { path: "*", element: <HomeView /> },
      ],
    },
  ]);

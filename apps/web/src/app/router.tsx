import { createBrowserRouter } from "react-router";

import { GuestOnly, RequireSession } from "./ui/session-gate";

// Экраны приложения — внутри оболочки (app-routes.tsx): на компьютере боковые разделы
// открываются в колонке списка, и правая часть живёт своими <Routes>.
export const createRouter = () =>
  createBrowserRouter([
    { path: "/login", element: <GuestOnly /> },
    { path: "*", element: <RequireSession /> },
  ]);

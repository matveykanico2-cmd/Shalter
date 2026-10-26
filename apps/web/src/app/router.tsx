import { createBrowserRouter } from "react-router";

import { OAuthAuthorizeView } from "@/views/oauth-authorize";
import { QrLoginView } from "@/views/qr-login";

import { GuestOnly, RequireSession } from "./ui/session-gate";

// Экраны приложения — внутри оболочки (app-routes.tsx): на компьютере боковые разделы
// открываются в колонке списка, и правая часть живёт своими <Routes>.
export const createRouter = () =>
  createBrowserRouter([
    { path: "/login", element: <GuestOnly /> },
    // Вне оболочки и со входом, и без: подтверждение QR-входа и экран согласия OAuth.
    { path: "/qr-login", element: <QrLoginView /> },
    { path: "/oauth/authorize", element: <OAuthAuthorizeView /> },
    { path: "*", element: <RequireSession /> },
  ]);

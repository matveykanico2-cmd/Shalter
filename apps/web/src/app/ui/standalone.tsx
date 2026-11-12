import { lazy, type ReactNode, Suspense, useEffect } from "react";

import { hideBootSplash } from "../model/boot-splash";

import { Splash } from "./splash";

// Экраны без оболочки — отдельными чанками: вошедшему в приложение они на старте не нужны.
const QrLoginView = lazy(() => import("@/views/qr-login").then((m) => ({ default: m.QrLoginView })));
const OAuthAuthorizeView = lazy(() => import("@/views/oauth-authorize").then((m) => ({ default: m.OAuthAuthorizeView })));

/** Страницы вне оболочки рисуются сразу — заставка из index.html им не нужна. */
export function Standalone({ children }: { children: ReactNode }) {
  useEffect(hideBootSplash, []);
  return <Suspense fallback={<Splash />}>{children}</Suspense>;
}

/** Подтверждение QR-входа. */
export const QrLoginRoute = () => (
  <Standalone>
    <QrLoginView />
  </Standalone>
);

/** Экран согласия OAuth. */
export const OAuthAuthorizeRoute = () => (
  <Standalone>
    <OAuthAuthorizeView />
  </Standalone>
);

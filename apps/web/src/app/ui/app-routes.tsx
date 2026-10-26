import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router";

import { CallJoinView, CallView } from "@/views/call";
import { CallsView } from "@/views/calls";
import { ChatView } from "@/views/chat";
import { HomeView } from "@/views/home";
import { JoinView } from "@/views/join";
import { UsernameView } from "@/views/username";

import { AppShell } from "@/widgets/app-shell";
import { ChatList } from "@/widgets/chat-list";

import type { SelfUser } from "@/entities/session";

import { DESKTOP_QUERY, isSidePath, setMainPath } from "@/shared/lib/side-panel";
import { useMediaQuery } from "@/shared/lib/use-media-query";

import { AtUsername } from "./at-username";

// Разделы, которые открывают не сразу, — отдельными чанками (как import() в public/js/app.js).
const SettingsView = lazy(() => import("@/views/settings").then((m) => ({ default: m.SettingsView })));
const ContactsView = lazy(() => import("@/views/contacts").then((m) => ({ default: m.ContactsView })));
const ArchiveView = lazy(() => import("@/views/archive").then((m) => ({ default: m.ArchiveView })));

const lazyView = (node: ReactNode) => <Suspense fallback={null}>{node}</Suspense>;

/** Боковые разделы: на компьютере — в колонке списка чатов, на телефоне — во весь экран. */
const sideRoutes = () => [
  <Route key="contacts" path="contacts" element={lazyView(<ContactsView />)} />,
  <Route key="calls" path="calls" element={<CallsView />} />,
  <Route key="archive" path="archive" element={lazyView(<ArchiveView />)} />,
  <Route key="settings" path="settings" element={lazyView(<SettingsView />)} />,
  <Route key="settings-section" path="settings/:section" element={lazyView(<SettingsView />)} />,
];

const mainRoutes = () => [
  <Route key="home" index element={<HomeView />} />,
  <Route key="chat" path="chat/:chatId" element={<ChatView />} />,
  <Route key="call" path="call/:callId" element={<CallView />} />,
  <Route key="call-join" path="call-join/:token" element={<CallJoinView />} />,
  // Ссылки как t.me/имя: /u/имя и /@имя.
  <Route key="u" path="u/:username" element={<UsernameView />} />,
  <Route key="join" path="join/:code" element={<JoinView />} />,
  ...sideRoutes(),
  <Route key="at" path=":username" element={<AtUsername />} />,
  <Route key="rest" path="*" element={<HomeView />} />,
];

/** Оболочка и экраны внутри неё: справа — чат и прочее, слева — список чатов или боковой раздел. */
export function AppRoutes({ user, chatsReady }: { user: SelfUser; chatsReady: boolean }) {
  const location = useLocation();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const side = desktop && isSidePath(location.pathname);
  // Пока слева открыт боковой раздел, справа остаётся прежний экран.
  const [mainLocation, setMainLocation] = useState(location);
  if (!side && mainLocation !== location) setMainLocation(location);
  const shownMain = side && isSidePath(mainLocation.pathname) ? { ...mainLocation, pathname: "/" } : mainLocation;
  useEffect(() => setMainPath(shownMain.pathname + shownMain.search), [shownMain.pathname, shownMain.search]);

  return (
    <AppShell
      user={user}
      mainOpen={!side && location.pathname !== "/"}
      sidebar={side ? <Routes>{sideRoutes()}</Routes> : chatsReady ? <ChatList meId={user.id} /> : null}
      main={<Routes location={side ? shownMain : location}>{mainRoutes()}</Routes>}
    />
  );
}

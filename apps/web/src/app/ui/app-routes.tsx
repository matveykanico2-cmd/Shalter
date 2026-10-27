import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router";

import { HomeView } from "@/views/home";

import { AppShell } from "@/widgets/app-shell";
import { ChatList } from "@/widgets/chat-list";
import { UserProfileHost } from "@/widgets/user-profile";

import { usePhoneBookSync } from "@/features/manage-contacts";
import { ShareInboxHost, ShareRoute } from "@/features/share-inbox";

import type { SelfUser } from "@/entities/session";

import { DESKTOP_QUERY, isSidePath, setMainPath } from "@/shared/lib/side-panel";
import { useMediaQuery } from "@/shared/lib/use-media-query";

import { AtUsername } from "./at-username";

// Экраны — отдельными чанками (как import() в public/js/app.js): оболочка и список чатов
// появляются раньше, экран чата подгружается в простое (prefetchChat).
const loadChat = () => import("@/views/chat");
const ChatView = lazy(() => loadChat().then((m) => ({ default: m.ChatView })));
const CallView = lazy(() => import("@/views/call").then((m) => ({ default: m.CallView })));
const CallJoinView = lazy(() => import("@/views/call").then((m) => ({ default: m.CallJoinView })));
const CallsView = lazy(() => import("@/views/calls").then((m) => ({ default: m.CallsView })));
const UsernameView = lazy(() => import("@/views/username").then((m) => ({ default: m.UsernameView })));
const JoinView = lazy(() => import("@/views/join").then((m) => ({ default: m.JoinView })));
const SettingsView = lazy(() => import("@/views/settings").then((m) => ({ default: m.SettingsView })));
const ContactsView = lazy(() => import("@/views/contacts").then((m) => ({ default: m.ContactsView })));
const ArchiveView = lazy(() => import("@/views/archive").then((m) => ({ default: m.ArchiveView })));
const NearbyView = lazy(() => import("@/views/nearby").then((m) => ({ default: m.NearbyView })));
const DiscoverChannelsView = lazy(() => import("@/views/discover-channels").then((m) => ({ default: m.DiscoverChannelsView })));
const CommunityView = lazy(() => import("@/views/community").then((m) => ({ default: m.CommunityView })));
const FolderInviteView = lazy(() => import("@/views/folder-invite").then((m) => ({ default: m.FolderInviteView })));
const QrScanView = lazy(() => import("@/views/qr-scan").then((m) => ({ default: m.QrScanView })));

const lazyView = (node: ReactNode) => <Suspense fallback={null}>{node}</Suspense>;

/** Боковые разделы: на компьютере — в колонке списка чатов, на телефоне — во весь экран. */
const sideRoutes = () => [
  <Route key="contacts" path="contacts" element={lazyView(<ContactsView />)} />,
  <Route key="calls" path="calls" element={lazyView(<CallsView />)} />,
  <Route key="archive" path="archive" element={lazyView(<ArchiveView />)} />,
  <Route key="settings" path="settings" element={lazyView(<SettingsView />)} />,
  <Route key="settings-section" path="settings/:section" element={lazyView(<SettingsView />)} />,
];

const mainRoutes = () => [
  <Route key="home" index element={<HomeView />} />,
  <Route key="chat" path="chat/:chatId" element={lazyView(<ChatView />)} />,
  <Route key="call" path="call/:callId" element={lazyView(<CallView />)} />,
  <Route key="call-join" path="call-join/:token" element={lazyView(<CallJoinView />)} />,
  // Ссылки как t.me/имя: /u/имя и /@имя.
  <Route key="u" path="u/:username" element={lazyView(<UsernameView />)} />,
  <Route key="join" path="join/:code" element={lazyView(<JoinView />)} />,
  <Route key="nearby" path="nearby" element={lazyView(<NearbyView />)} />,
  <Route key="discover-channels" path="discover-channels" element={lazyView(<DiscoverChannelsView />)} />,
  <Route key="community" path="community/:id" element={lazyView(<CommunityView />)} />,
  <Route key="folder" path="folder/:code" element={lazyView(<FolderInviteView />)} />,
  <Route key="qr-scan" path="qr-scan" element={lazyView(<QrScanView />)} />,
  // Системное «Поделиться»: окно поверх и сразу к чатам.
  <Route key="share" path="share/:token" element={<ShareRoute />} />,
  ...sideRoutes(),
  <Route key="at" path=":username" element={<AtUsername />} />,
  <Route key="rest" path="*" element={<HomeView />} />,
];

/** Оболочка и экраны внутри неё: справа — чат и прочее, слева — список чатов или боковой раздел. */
export function AppRoutes({ user, chatsReady }: { user: SelfUser; chatsReady: boolean }) {
  const location = useLocation();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  // Экран чата — заранее, в простое: первый открытый чат не ждёт загрузки кода.
  useEffect(() => {
    const prefetch = () => void loadChat().catch(() => {});
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(prefetch, 1200);
    return () => clearTimeout(t);
  }, []);
  const side = desktop && isSidePath(location.pathname);
  // Пока слева открыт боковой раздел, справа остаётся прежний экран.
  const [mainLocation, setMainLocation] = useState(location);
  if (!side && mainLocation !== location) setMainLocation(location);
  const shownMain = side && isSidePath(mainLocation.pathname) ? { ...mainLocation, pathname: "/" } : mainLocation;
  useEffect(() => setMainPath(shownMain.pathname + shownMain.search), [shownMain.pathname, shownMain.search]);
  // Нативное приложение тихо подтягивает новых людей из телефонной книги.
  usePhoneBookSync();

  return (
    <>
      <AppShell
        user={user}
        mainOpen={!side && location.pathname !== "/"}
        // Список чатов остаётся смонтированным под боковой панелью (как .side-open): события
        // сокета, прокрутка и вкладки не теряются, пока открыты настройки или контакты.
        sidebar={chatsReady ? <ChatList meId={user.id} /> : null}
        side={side ? <Routes>{sideRoutes()}</Routes> : null}
        main={<Routes location={side ? shownMain : location}>{mainRoutes()}</Routes>}
      />
      {/* Профиль человека — панель поверх всего, открывается откуда угодно (openUserProfile). */}
      <UserProfileHost />
      <ShareInboxHost />
    </>
  );
}

import { createBrowserRouter } from "react-router";

import { CallJoinView, CallView } from "@/views/call";
import { CallsView } from "@/views/calls";
import { ChatView } from "@/views/chat";
import { HomeView } from "@/views/home";
import { JoinView } from "@/views/join";
import { UsernameView } from "@/views/username";

import { AtUsername } from "./ui/at-username";
import { GuestOnly, RequireSession } from "./ui/session-gate";

export const createRouter = () =>
  createBrowserRouter([
    { path: "/login", element: <GuestOnly /> },
    {
      element: <RequireSession />,
      children: [
        { index: true, element: <HomeView /> },
        { path: "chat/:chatId", element: <ChatView /> },
        { path: "call/:callId", element: <CallView /> },
        { path: "call-join/:token", element: <CallJoinView /> },
        { path: "calls", element: <CallsView /> },
        // Ссылки как t.me/имя: /u/имя и /@имя.
        { path: "u/:username", element: <UsernameView /> },
        { path: "join/:code", element: <JoinView /> },
        { path: ":username", element: <AtUsername /> },
        { path: "*", element: <HomeView /> },
      ],
    },
  ]);

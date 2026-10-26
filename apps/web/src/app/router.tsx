import { createBrowserRouter } from "react-router";

import { ChatView } from "@/views/chat";
import { HomeView } from "@/views/home";
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
        // Ссылки как t.me/имя: /u/имя и /@имя.
        { path: "u/:username", element: <UsernameView /> },
        { path: ":username", element: <AtUsername /> },
        { path: "*", element: <HomeView /> },
      ],
    },
  ]);

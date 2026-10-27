import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";

import { openSavedMessages } from "@/features/accounts";

import { chatQueries, sortChats } from "@/entities/chat";
import { sessionQueries } from "@/entities/session";

import { CHAT_TAB_EVENT } from "@/shared/lib/chat-tab-event";

const searchInput = () => document.querySelector<HTMLInputElement>('input[type="search"][aria-label="Поиск"]');
const overlayOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');

/**
 * Горячие клавиши, как public/js/lib/keyboardShortcuts.js: Ctrl/⌘+K или F — поиск по чатам,
 * Alt+↑/↓ — соседний чат списка, Esc — закрыть открытый чат.
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const client = useQueryClient();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && !e.shiftKey && !e.altKey && (key === "f" || key === "k" || e.code === "KeyF" || e.code === "KeyK")) {
        const input = searchInput();
        if (!input) return;
        e.preventDefault();
        // Поиск спрятан (на телефоне открыт чат) — сначала к списку.
        if (!input.offsetParent) {
          void navigate("/");
          setTimeout(() => searchInput()?.focus(), 50);
        } else {
          input.focus();
          input.select();
        }
        return;
      }

      // Ctrl/⌘+1…9 — вкладка списка чатов по номеру, Ctrl/⌘+0 — «Избранное».
      if (mod && !e.shiftKey && !e.altKey && /^Digit[0-9]$/.test(e.code) && !overlayOpen()) {
        const n = Number(e.code.slice(5));
        e.preventDefault();
        if (n === 0) {
          const me = client.getQueryData(sessionQueries.current().queryKey)?.user;
          if (me) void openSavedMessages(me, client, navigate);
          return;
        }
        window.dispatchEvent(new CustomEvent(CHAT_TAB_EVENT, { detail: n - 1 }));
        const path = window.location.pathname;
        if (path !== "/" && !path.startsWith("/chat/")) void navigate("/");
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const chats = client.getQueryData(chatQueries.list().queryKey);
        const list = sortChats((chats ?? []).filter((c) => !c.archived)).map((c) => c.id);
        if (!list.length) return;
        const currentId = /^\/chat\/([^/]+)/.exec(window.location.pathname)?.[1];
        const idx = currentId ? list.indexOf(currentId) : -1;
        const delta = e.key === "ArrowUp" ? -1 : 1;
        const next = idx === -1 ? (delta > 0 ? 0 : list.length - 1) : (idx + delta + list.length) % list.length;
        e.preventDefault();
        void navigate(`/chat/${list[next]}`);
        return;
      }

      if (e.key === "Escape" && !e.defaultPrevented && !overlayOpen() && window.location.pathname.startsWith("/chat/")) {
        // Отменяем: «Назад» в Android-приложении (use-back-button.ts) видит, что экран уже сменился.
        e.preventDefault();
        void navigate("/");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate, client]);
}

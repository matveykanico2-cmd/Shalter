import { getState } from "../state.js";
import { navigate } from "../router.js";

// Every shortcut here is listed verbatim on the Settings → Горячие клавиши
// page (see views/settings/index.js's renderShortcuts) — keep that list in
// sync with whatever's actually wired up below, rather than describing
// shortcuts that don't exist.

function sortedChats() {
  const { chats } = getState();
  // Same ordering as the "Все" tab in chatList.js's renderInto — pinned
  // first, then most-recent-activity — so Alt+Up/Down matches what's
  // actually visible in the list.
  return [...chats.filter((c) => !c.archived)].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessage?.createdAt ?? a.createdAt;
    const bt = b.lastMessage?.createdAt ?? b.createdAt;
    return bt.localeCompare(at);
  });
}

export function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      const input = document.querySelector(".chat-search-input");
      if (!input) return;
      e.preventDefault();
      input.focus();
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const list = sortedChats();
      if (!list.length) return;
      const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];
      const idx = list.findIndex((c) => c.id === currentId);
      const delta = e.key === "ArrowUp" ? -1 : 1;
      const next = list[(((idx === -1 ? 0 : idx) + delta) % list.length + list.length) % list.length];
      e.preventDefault();
      navigate(`/chat/${next.id}`);
      return;
    }

    // A modal/dropdown already handles its own Escape (see confirmDialog.js,
    // dropdownMenu.js etc.) — only step in here once nothing else did.
    if (e.key === "Escape" && !document.querySelector(".modal-overlay, .dropdown-menu") && window.location.pathname.startsWith("/chat/")) {
      navigate("/");
    }
  });
}

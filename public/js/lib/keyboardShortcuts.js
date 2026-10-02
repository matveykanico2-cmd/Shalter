import { navigate } from "../router.js";
import { getVisibleChatIds, selectTabByIndex } from "../views/chatList.js";
import { openSavedMessages } from "../components/sidebarMenu.js";

function focusSearch() {
  const input = document.querySelector(".chat-search-input");
  if (!input) return false;
  const focus = () => {
    input.focus();
    input.select();
  };
  if (!input.offsetParent) {
    navigate("/");
    setTimeout(focus, 50);
  } else focus();
  return true;
}

export function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && !e.shiftKey && !e.altKey && (key === "f" || key === "k" || e.code === "KeyF" || e.code === "KeyK")) {
      if (!document.querySelector(".chat-search-input")) return;
      e.preventDefault();
      focusSearch();
      return;
    }

    if (mod && !e.shiftKey && !e.altKey && /^Digit[0-9]$/.test(e.code) && !document.querySelector(".modal-overlay")) {
      const n = Number(e.code.slice(5));
      e.preventDefault();
      if (n === 0) {
        openSavedMessages();
        return;
      }
      if (selectTabByIndex(n - 1) && window.location.pathname !== "/" && !window.location.pathname.startsWith("/chat/")) {
        navigate("/");
      }
      return;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const list = getVisibleChatIds();
      if (!list.length) return;
      const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];
      const idx = list.indexOf(currentId);
      const delta = e.key === "ArrowUp" ? -1 : 1;
      const nextIdx = idx === -1 ? (delta > 0 ? 0 : list.length - 1) : (((idx + delta) % list.length) + list.length) % list.length;
      e.preventDefault();
      navigate(`/chat/${list[nextIdx]}`);
      return;
    }

    if (
      e.key === "Escape" &&
      !document.querySelector(".modal-overlay, .dropdown-menu") &&
      window.location.pathname.startsWith("/chat/")
    ) {
      navigate("/");
    }
  });
}

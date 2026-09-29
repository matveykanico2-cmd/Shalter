import { navigate } from "../router.js";
import { getVisibleChatIds, selectTabByIndex } from "../views/chatList.js";
import { openSavedMessages } from "../components/sidebarMenu.js";

// Every shortcut here is listed verbatim on the Settings → Горячие клавиши
// page (see views/settings/index.js's renderShortcuts) — keep that list in
// sync with whatever's actually wired up below, rather than describing
// shortcuts that don't exist.

function focusSearch() {
  const input = document.querySelector(".chat-search-input");
  if (!input) return false;
  // На телефоне колонка со списком спрятана, пока открыт чат, — искать там
  // негде, сначала возвращаемся к списку.
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

    // Поиск: Ctrl+F (как было) и Ctrl+K — привычное «быстрое открытие» из
    // Telegram Desktop и половины современных приложений. Раскладка не важна:
    // e.code — физическая клавиша, «а» на русской раскладке — та же F.
    if (mod && !e.shiftKey && !e.altKey && (key === "f" || key === "k" || e.code === "KeyF" || e.code === "KeyK")) {
      if (!document.querySelector(".chat-search-input")) return;
      e.preventDefault();
      focusSearch();
      return;
    }

    // Ctrl+0 — «Избранное», Ctrl+1…9 — вкладки и папки по порядку, как в
    // Telegram Desktop.
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
      // Порядок — тот, что сейчас на экране (вкладка, папка, архив, фильтр),
      // а не собственная копия всего списка.
      const list = getVisibleChatIds();
      if (!list.length) return;
      const currentId = (window.location.pathname.match(/^\/chat\/([^/]+)/) || [])[1];
      const idx = list.indexOf(currentId);
      const delta = e.key === "ArrowUp" ? -1 : 1;
      // Ни один чат не открыт — ↓ ведёт к первому, ↑ к последнему.
      const nextIdx = idx === -1 ? (delta > 0 ? 0 : list.length - 1) : (((idx + delta) % list.length) + list.length) % list.length;
      e.preventDefault();
      navigate(`/chat/${list[nextIdx]}`);
      return;
    }

    // A modal/dropdown already handles its own Escape (see confirmDialog.js,
    // dropdownMenu.js etc.) — only step in here once nothing else did.
    if (
      e.key === "Escape" &&
      !document.querySelector(".modal-overlay, .dropdown-menu") &&
      window.location.pathname.startsWith("/chat/")
    ) {
      navigate("/");
    }
  });
}

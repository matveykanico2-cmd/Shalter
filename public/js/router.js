const routes = [];
let notFoundHandler = () => {};
let currentPath = null;
let lastRenderOk = true;

function toMatcher(pattern) {
  const keys = [];
  const regexStr =
    "^" +
    pattern
      .split("/")
      .map((seg) => {
        if (seg.startsWith(":")) {
          keys.push(seg.slice(1));
          return "([^/]+)";
        }
        // «/@:username» — ссылки как у t.me/<ник>.
        if (seg.startsWith("@:")) {
          keys.push(seg.slice(2));
          return "@([^/]+)";
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/") +
    "$";
  return { regex: new RegExp(regexStr), keys };
}

export function route(pattern, render) {
  routes.push({ ...toMatcher(pattern), render });
}

export function notFound(render) {
  notFoundHandler = render;
}

async function render() {
  const path = window.location.pathname;
  currentPath = path;
  lastRenderOk = false;
  window.dispatchEvent(new CustomEvent("app:navigate", { detail: { path } }));
  try {
    for (const r of routes) {
      const m = r.regex.exec(path);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        await r.render(params);
        lastRenderOk = true;
        return;
      }
    }
    await notFoundHandler();
    lastRenderOk = true;
  } catch (err) {
    console.error("Не удалось открыть", path, err);
    // На плохой сети чаще всего не догрузился сам модуль экрана: сообщаем шеллу
    // (покажет, что случилось) и пробуем ещё раз, когда связь вернётся.
    window.dispatchEvent(new CustomEvent("app:route-error", { detail: { path, error: err } }));
    retryWhenOnline(path);
  }
}

let retryArmed = false;
function retryWhenOnline(path) {
  if (retryArmed) return;
  retryArmed = true;
  const again = () => {
    window.removeEventListener("online", again);
    clearTimeout(timer);
    retryArmed = false;
    if (currentPath === path && !lastRenderOk) render();
  };
  window.addEventListener("online", again);
  // Сеть могла и не пропадать целиком (просто медленная) — тогда события online не будет.
  const timer = setTimeout(again, 5000);
}

export function navigate(path, { replace = false } = {}) {
  if (path === currentPath && lastRenderOk) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  render();
}

// Полноэкранные окна поверх экрана (просмотр фото, игра): системная «Назад»
// закрывает окно, а не уходит с экрана. Без этого на телефоне без сети «Назад»
// уводил на экран, который не загружался, а просмотрщик оставался висеть.
const overlays = [];
let overlaySeq = 0;
let skipPops = 0;
export function pushOverlay(onBack) {
  const id = ++overlaySeq;
  try {
    window.history.pushState({ ...(window.history.state ?? {}), overlayId: id }, "", window.location.href);
  } catch {
    return () => {};
  }
  overlays.push({ id, onBack });
  // Закрыли кнопкой/крестиком — убираем свою запись из истории.
  return () => {
    const i = overlays.findIndex((o) => o.id === id);
    if (i < 0) return;
    overlays.splice(i, 1);
    if (window.history.state?.overlayId === id) {
      skipPops++;
      window.history.back();
    }
  };
}

function onPopState() {
  if (skipPops > 0) {
    skipPops--;
    return;
  }
  const top = overlays[overlays.length - 1];
  if (top && window.history.state?.overlayId !== top.id) {
    overlays.pop();
    try {
      top.onBack();
    } catch {}
    return;
  }
  if (window.history.state?.overlayId && window.location.pathname === currentPath) return;
  render();
}

export function currentRoutePath() {
  return currentPath;
}

export function startRouter() {
  window.addEventListener("popstate", onPopState);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-route]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http") || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(href);
  });
  // Return promise that resolves after first render completes
  return render();
}

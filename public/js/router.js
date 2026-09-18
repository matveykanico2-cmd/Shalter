// Hand-rolled History API router. Keeps the shell (nav rail, chat list,
// active-call bar) mounted across navigation — a full page reload would
// tear those down along with any live polling/websocket state.
const routes = [];
let notFoundHandler = () => {};
let currentPath = null;
// Whether the view for currentPath actually finished mounting. Without this,
// an exception anywhere during a route's render (e.g. an info-panel update
// crashing while re-rendering after editing a chat's photo/description) left
// currentPath pointing at that route forever — navigate()'s "already here"
// guard below then silently no-op'd on every future click to that exact
// chat, and only a full page reload (which resets this module) recovered.
// That's the bug behind "clicking this chat does nothing now".
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
    // Left as false on purpose — see lastRenderOk's comment above. Logged
    // rather than swallowed so a broken mount is at least visible somewhere.
    console.error("Не удалось открыть", path, err);
  }
}

export function navigate(path, { replace = false } = {}) {
  if (path === currentPath && lastRenderOk) return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  render();
}

export function currentRoutePath() {
  return currentPath;
}

export function startRouter() {
  window.addEventListener("popstate", render);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-route]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http") || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(href);
  });
  render();
}

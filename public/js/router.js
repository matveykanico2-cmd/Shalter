// Hand-rolled History API router. Keeps the shell (nav rail, chat list,
// active-call bar) mounted across navigation — a full page reload would
// tear those down along with any live polling/websocket state.
const routes = [];
let notFoundHandler = () => {};
let currentPath = null;

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
  window.dispatchEvent(new CustomEvent("app:navigate", { detail: { path } }));
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      await r.render(params);
      return;
    }
  }
  await notFoundHandler();
}

export function navigate(path, { replace = false } = {}) {
  if (path === currentPath) return;
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

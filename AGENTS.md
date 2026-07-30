<!-- BEGIN:nextjs-agent-rules -->
# Plain Express + vanilla JS — no framework

This project was migrated off Next.js/React. There is no framework here anymore: Express on the backend (`server/`), plain HTML/CSS/JS on the frontend (`public/`). No React, no TypeScript, no Tailwind — don't reach for any of them out of habit, and don't reintroduce Next.js conventions from training data.

- Source in `public/` is still framework-free native ES modules with no transpilation — write only syntax the target browsers support natively. There *is* a production build (`npm run build` → `scripts/build.js`, esbuild) that bundles/minifies/precompresses `public/` into `public/dist/` for deployment (see DEPLOY.md) — but it's a packaging step, not a framework; don't add JSX, TS, or bundler-dependent syntax that only works because a bundler is now in the loop. `npm run dev` still serves the raw, unbundled source directly.
- The client-side router (`public/js/router.js`) keeps the shell (nav rail, chat list, an in-progress call's PiP bubble) mounted across navigation. Route views live in `public/js/views/`.
- Data persistence is flat JSON files under `data/`, accessed only through `server/data/store.js`'s locked, cached read/update helpers — never read or write those files directly from a route handler, and never run more than one server process against the same `data/` directory (see DEPLOY.md — the read cache and lock are both in-process only).
- Call signaling is WebSocket-first (`server/ws.js`, `public/js/lib/wsClient.js`) with HTTP polling kept only as a reconnect/catch-up fallback.
<!-- END:nextjs-agent-rules -->

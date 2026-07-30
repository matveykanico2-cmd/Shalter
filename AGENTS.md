<!-- BEGIN:nextjs-agent-rules -->
# Plain Express + vanilla JS — no framework

This project was migrated off Next.js/React. There is no framework here anymore: Express on the backend (`server/`), no-build-step HTML/CSS/JS on the frontend (`public/`). No React, no TypeScript, no Tailwind, no bundler — don't reach for any of them out of habit, and don't reintroduce Next.js conventions from training data.

- Frontend modules are native ES modules (`<script type="module">`), loaded directly by the browser — no transpilation step, so only use syntax the target browsers support natively.
- The client-side router (`public/js/router.js`) keeps the shell (nav rail, chat list, an in-progress call's PiP bubble) mounted across navigation. Route views live in `public/js/views/`.
- Data persistence is flat JSON files under `data/`, accessed only through `server/data/store.js`'s locked read/update helpers — never read or write those files directly from a route handler.
- Call signaling is WebSocket-first (`server/ws.js`, `public/js/lib/wsClient.js`) with HTTP polling kept only as a reconnect/catch-up fallback.
<!-- END:nextjs-agent-rules -->

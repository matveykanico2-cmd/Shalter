# Migration in progress: Express + vanilla JS → NestJS + React

The project is moving module by module from plain Express (`server/`) and framework-free JS (`public/`) to a NestJS backend (`apps/api`) and, later, a React frontend (`apps/web`). The plan and its progress live in the migration plan doc; check it before starting a migration step. Until a part is migrated, the old code is the production code. Keep it working, and don't port it ahead of the plan.

## Layout (npm workspaces, not pnpm)

- `server/` is the legacy Express backend (CommonJS) and still serves everything that hasn't moved. `server/app.js` builds the Express app. `server/runtime.js` runs what lives next to the HTTP server: WS, the background worker, RTMP, push, and shutdown. `server/index.js` is the standalone entry point, and production still runs it.
- `apps/api` is NestJS 12 on the Express adapter (TypeScript, ESM, `npm run build:api` → `apps/api/dist/main.js`). It mounts the whole legacy app as a fallback: Nest routes run first, and any path Nest has no route for goes to `server/app.js` (`legacy-fallback.adapter.ts`). Migrating a module means adding its Nest module and removing the matching router from `server/app.js` in the same change.
- `packages/contract-tests` holds the test suite (Vitest + Playwright). It pins behaviour, and both targets must pass: `TARGET=legacy` (default) and `TARGET=nest` (build `apps/api` first). See its README.
- `public/` stays framework-free native ES modules until stage 4 (React + Vite in `apps/web`). No JSX, TS, or bundler-only syntax there. `npm run build` (esbuild) is only packaging, and `npm run dev` serves the raw source.

## Rules that hold across the migration

- **Feature freeze until the core (auth, chats, messages, uploads, WS, calls) is migrated** (decided 2026-10-21): no new features in either backend, only bug fixes.
- **New backend code is TypeScript in `apps/api`.** Don't add new modules to `server/`. Fix bugs where the code currently lives.
- **Never mount the legacy app as an Express sub-app inside Nest.** Express 5 (Nest) would swap its req/res prototypes. Keep the wrapper in `legacy-fallback.adapter.ts`.
- **Behaviour doesn't change during a move.** A migrated module is done when its contract tests are green on `TARGET=nest` without edits to the tests. Any intentional behaviour change in either backend must keep `npm run test:contract` green on both targets.
- **Contract tests are black-box** (HTTP/WS only, never import `server/` or `apps/`). Write tests for a module before migrating it if it has none.
- **Data:** SQLite at `data/app.db` (`better-sqlite3`, schema in `server/db.js`), accessed only through the `server/data/*.js` modules, or through their typed repositories in `apps/api` once those exist. Never query the connection from a route handler or controller. Relational data (chat membership, call participants) lives in join tables. Nested, never cross-queried fields stay as JSON TEXT columns on the parent row. Encrypted data (messages, files, key rotation) must stay byte-compatible: `packages/contract-tests/compat` is the fixture that proves it.
- **One API process per `data/` directory.** Typing presence and WS connections are in-memory. The background worker `server/worker.js` is forked by the runtime itself for timer sweeps and the `background_jobs` queue, and reaches clients only by relaying WS events (`server/lib/workerBridge.js`). Never start it separately.
- Call signaling is WebSocket-first (`server/ws.js`, `public/js/lib/wsClient.js`). HTTP polling is only a reconnect fallback.
- The client-side router (`public/js/router.js`) keeps the shell (nav rail, chat list, an in-progress call's PiP bubble) mounted across navigation. Route views live in `public/js/views/`.
- Deploys are done by someone else: any server-side step goes into DEPLOY.md as runnable commands.

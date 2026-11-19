# Shalter

Open-source messenger with chats, groups, channels, comments, stories, media, voice messages, video-notes and WebRTC calls. The client is React, the production API is NestJS, and SQLite remains the shared data store during migration.

## Getting started

```bash
npm install
npm run dev       # backend (apps/api/dist/main.js under nodemon) on :3000
npm run dev:web   # client (Vite) on :5173, proxies /api and /ws to :3000
```
Проект работает на shalter.ru. Автор — Матвей Николаенко и команда Shalter.

Open http://localhost:5173. Production: `npm run build && npm run build:api && npm run start:nest` (the backend serves the client build `apps/web/dist` on :3000).

## Architecture

Миграция описана в `AGENTS.md`: новый backend-код добавляется в `apps/api`, а оставшийся `server/` используется только через типизированный bridge до миграции соответствующего модуля. `apps/web` — единственный клиент. `packages/contract-tests` фиксирует HTTP/WS-поведение для Nest target.

- **`apps/api`** — NestJS entry point (`npm run build:api && npm run start:nest`).
- **`server/`** — compatibility/runtime layer: SQLite schema/data helpers, storage, push, media processing, worker and runtime bridges. Это не второй клиент и не rollback-цель.
- **`apps/web`** — the client: Vite + React 19 + react-router 8 + TanStack Query, laid out by FSD 2.0 (`app → views → widgets → features → entities → shared`). The shell (navigation bar, chat list, an in-progress call's bubble) stays mounted across navigation.
- **`public/`** — static files: doc, promo and download pages, icons, images, `sw.js`, gift scenes, the bot mini-app SDK (`/js/shalter-web-app.js`).
- **`data/app.db`** — SQLite-база (схема принадлежит `server/db.js`, а Nest описывает её через Drizzle). Связи участников чатов и звонков нормализованы в join-таблицы; вложенные поля, которые не ищутся между строками, остаются JSON.

## Technology map

- Frontend: React 19, TypeScript, Vite, React Router 8, TanStack Query, TanStack Virtual, CSS Modules и FSD 2.0.
- Backend: NestJS 12 на Express, TypeScript, Drizzle repositories поверх существующего better-sqlite3-соединения.
- Realtime: авторизованный WebSocket с reconnect/backoff; звонки используют WebRTC mesh со STUN/TURN.
- Background delivery: Web Push через Service Worker, FCM для Android и native desktop/mobile bridges.
- Media: range-friendly uploads, серверные превью, lazy thumbnails и общий media viewer.
- Tests: Vitest/Testing Library для unit/UI и Playwright/contract tests для HTTP/WS.

## Contributor rules

Не добавляйте новые маршруты в `server/`: используйте соответствующий Nest-модуль. Общие схемы API хранятся в `packages/shared`, frontend соблюдает границы FSD. Перед release запускайте проверки web, API и релевантные contract tests.

## Calls

WebRTC with a mesh topology (one `RTCPeerConnection` per remote participant), signaled primarily over WebSocket with HTTP polling as a reconnect/catch-up fallback. ICE uses Google's public STUN plus the Open Relay Project's public TURN relay — fine for getting calls working across NATs, but swap in a dedicated TURN server (e.g. self-hosted `coturn`) before relying on this for production traffic.

## Posts/channels

A channel is a `Chat` with `type: "channel"`; posts are just `Message`s in it. Publishing a post auto-forwards a copy into the channel's linked discussion group (`Chat.linkedDiscussionChatId`), and comments are ordinary replies to that forwarded copy — the same pattern Telegram uses.

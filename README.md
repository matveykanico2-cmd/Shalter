# Shalter

A Telegram-style messenger: chats, groups, channels with posts/comments, real WebRTC calls, voice messages, and video-notes ("kruzhki"). React client (`apps/web`) on a NestJS backend (`apps/api`).

## Getting started

```bash
npm install
npm run dev       # backend (server/index.js under nodemon) on :3000
npm run dev:web   # client (Vite) on :5173, proxies /api and /ws to :3000
```

Open http://localhost:5173. Production: `npm run build && npm run build:api && npm run start:nest` (the backend serves the client build `apps/web/dist` on :3000).

## Architecture

Migration to NestJS + React (see AGENTS.md): `apps/api` is the NestJS 12 backend, which hands every route it doesn't own yet to the legacy Express app in `server/`; `apps/web` is the React client; `packages/contract-tests` holds the contract/e2e suite both backends must pass (`TARGET=legacy|nest`).

- **`apps/api`** — NestJS entry point (`npm run build:api && npm run start:nest`).
- **`server/`** — Express app. `routes/` are the HTTP API, `data/` is the storage layer (real SQLite, via `server/db.js`/`better-sqlite3`; one module per entity), `ws.js` handles WebSocket push (call signaling, incoming calls).
- **`apps/web`** — the client: Vite + React 19 + react-router 8 + TanStack Query, laid out by FSD 2.0 (`app → views → widgets → features → entities → shared`). The shell (navigation bar, chat list, an in-progress call's bubble) stays mounted across navigation.
- **`public/`** — static files: doc, promo and download pages, icons, images, `sw.js`, gift scenes, the bot mini-app SDK (`/js/shalter-web-app.js`).
- **`data/app.db`** — the SQLite database (schema in `server/db.js`). Genuinely relational data (chat membership, call participants) is normalized into join tables; per-row nested fields that are never queried across rows (message reactions, a folder's chat list, per-user settings, etc.) stay as JSON columns.

## Calls

WebRTC with a mesh topology (one `RTCPeerConnection` per remote participant), signaled primarily over WebSocket with HTTP polling as a reconnect/catch-up fallback. ICE uses Google's public STUN plus the Open Relay Project's public TURN relay — fine for getting calls working across NATs, but swap in a dedicated TURN server (e.g. self-hosted `coturn`) before relying on this for production traffic.

## Posts/channels

A channel is a `Chat` with `type: "channel"`; posts are just `Message`s in it. Publishing a post auto-forwards a copy into the channel's linked discussion group (`Chat.linkedDiscussionChatId`), and comments are ordinary replies to that forwarded copy — the same pattern Telegram uses.

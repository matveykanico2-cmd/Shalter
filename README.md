# Messenger

A Telegram-style messenger: chats, groups, channels with posts/comments, real WebRTC calls, voice messages, and video-notes ("kruzhki"). Plain HTML/CSS/JS frontend served by an Express backend — no build step, no framework.

## Getting started

```bash
npm install
npm run dev     # nodemon server/index.js, restarts on change
# or
npm start       # node server/index.js
```

Open http://localhost:3000.

## Architecture

- **`server/`** — Express app. `routes/` are the HTTP API, `data/` is the storage layer (real SQLite, via `server/db.js`/`better-sqlite3`; one module per entity), `ws.js` handles WebSocket push (call signaling, incoming calls).
- **`public/`** — the frontend. `index.html` is a single shell page; `js/router.js` is a small History-API router that swaps content into the shell without a page reload (so the nav rail, chat list, and an in-progress call's PiP bubble survive navigation). `js/views/` are route-level screens, `js/components/` are reusable pieces, `js/lib/` holds framework-free helpers (WebRTC call handling, MediaRecorder-based voice/video-note capture, a WebSocket client).
- **`data/app.db`** — the SQLite database (schema in `server/db.js`). Genuinely relational data (chat membership, call participants) is normalized into join tables; per-row nested fields that are never queried across rows (message reactions, a folder's chat list, per-user settings, etc.) stay as JSON columns.

## Calls

WebRTC with a mesh topology (one `RTCPeerConnection` per remote participant), signaled primarily over WebSocket with HTTP polling as a reconnect/catch-up fallback. ICE uses Google's public STUN plus the Open Relay Project's public TURN relay — fine for getting calls working across NATs, but swap in a dedicated TURN server (e.g. self-hosted `coturn`) before relying on this for production traffic.

## Posts/channels

A channel is a `Chat` with `type: "channel"`; posts are just `Message`s in it. Publishing a post auto-forwards a copy into the channel's linked discussion group (`Chat.linkedDiscussionChatId`), and comments are ordinary replies to that forwarded copy — the same pattern Telegram uses.

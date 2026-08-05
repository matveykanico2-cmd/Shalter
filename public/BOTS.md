# Shalter Bot API

Real bots, like Telegram's — you create one in the app (Settings → Боты →
Создать бота, optionally with an avatar). From there you have two ways to
give it actual behavior:

- **Write your own program, in any language, that runs wherever you want**
  (your laptop, a cheap VPS, a Raspberry Pi — it just needs outbound
  internet), using a token and the HTTP API described below. This is the
  rest of this document.
- **Write it right inside Shalter**, in the built-in code editor (Settings →
  Боты → the code icon next to your bot) — a JS function that runs
  server-side, in a sandbox, every time someone messages your bot. No token,
  no hosting, no polling loop to write — see [In-app editor](#in-app-editor-no-hosting-required)
  below. Good for quick bots; the external API is still there for anything
  that needs a real language runtime, npm packages, or its own database.

## Getting a token

1. In Shalter: the "+" menu next to the chat list → **Новый бот** (or
   Settings → Боты → Создать бота).
2. Give it a name and, if you want, an avatar image.
3. You'll see the token exactly once — copy it now. If you lose it, Settings
   → Боты has a "обновить токен" button (this invalidates the old one).

Anyone who has your bot's token can act as it — treat it like a password.
Don't commit it to a public repo; put it in an environment variable instead
(see the example below).

## Authentication

Every Bot API call needs the token as a bearer token, not the cookie-based
session the rest of Shalter's API uses:

```
Authorization: Bearer <your-bot-token>
```

Base URL: `https://your-shalter-domain.example/api/bot-api` (or
`http://localhost:3000/api/bot-api` against `npm run dev`).

## Endpoints

### `GET /me`

Your bot's own profile.

```bash
curl -H "Authorization: Bearer $TOKEN" https://your-domain/api/bot-api/me
```
```json
{ "bot": { "id": "bot_...", "name": "WeatherBot", "username": "weatherbot_bot", ... } }
```

### `GET /updates?after=<ISO timestamp>`

Polls for new messages sent *to* your bot (in any chat it's a member of) —
your own bot's replies are excluded, so you never see your own messages come
back around. Returns up to 200 at a time, oldest first. Omit `after` (or
pass nothing) to get recent history from the beginning; from then on, pass
the `createdAt` of the last message you saw so you don't reprocess it.

```bash
curl -H "Authorization: Bearer $TOKEN" "https://your-domain/api/bot-api/updates?after=2026-08-03T10:00:00.000Z"
```
```json
{
  "messages": [
    { "id": "m_...", "chatId": "c_...", "senderId": "u_...", "text": "/start", "createdAt": "2026-08-03T10:00:05.000Z" }
  ]
}
```

There's no push/webhook delivery — poll on an interval (the example below
uses 2 seconds, comfortably under the API's general rate limit of 300
requests/5 minutes per IP).

### `POST /sendMessage`

Sends a message as your bot into a chat it's already a member of (i.e. one
where someone has messaged it — a bot can't cold-message a stranger, same as
a real account).

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"chatId":"c_...","text":"Hello!"}' \
  https://your-domain/api/bot-api/sendMessage
```

Optional fields:
- `replyToId` — reply to a specific message.
- `keyboard` — an inline keyboard, rendered as tappable buttons under the
  message: `[[{ "text": "Yes", "action": "/yes" }, { "text": "No", "action": "/no" }]]`.
  Tapping a button sends `action` back as a normal message from that user —
  your bot sees it on the next `/updates` poll like any other text.

### `POST /ai`

Asks the server's configured AI (see [AI-powered bots](#ai-powered-bots)
below) and returns its text reply — so your external script doesn't need its
own API key either, same as the in-app editor's `bot.ai()`.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"Скажи, что сейчас происходит в мире IT одним предложением"}' \
  https://your-domain/api/bot-api/ai
```
```json
{ "text": "..." }
```

Optional fields: `system` (a system prompt — gives the reply a persona/
instructions without repeating them in every `prompt`), `maxTokens` (capped
at 2048 server-side). Rate-limited per bot (12 calls/minute) and will error
with a clear message if the deployment hasn't set `ANTHROPIC_API_KEY`.

## A complete example: an echo + command bot (Node.js)

Needs nothing but a recent Node (built-in `fetch`) — no dependencies.

```js
// bot.js
const TOKEN = process.env.SHALTER_BOT_TOKEN;
const BASE = process.env.SHALTER_API_BASE || "http://localhost:3000/api/bot-api";

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...options.headers },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const sendMessage = (chatId, text, extra = {}) => call("/sendMessage", { method: "POST", body: JSON.stringify({ chatId, text, ...extra }) });

async function handleMessage(msg) {
  const text = (msg.text || "").trim();

  if (text === "/start") {
    return sendMessage(msg.chatId, "Привет! Я пример бота. Попробуйте /ping или напишите что угодно — я повторю.", {
      keyboard: [[{ text: "Пинг", action: "/ping" }]],
    });
  }
  if (text === "/ping") {
    return sendMessage(msg.chatId, "🏓 pong");
  }
  return sendMessage(msg.chatId, `Вы написали: ${text}`);
}

async function main() {
  if (!TOKEN) throw new Error("Set SHALTER_BOT_TOKEN");
  let after = new Date().toISOString(); // skip history from before the bot started
  console.log("Bot running, polling for updates…");
  for (;;) {
    try {
      const { messages } = await call(`/updates?after=${encodeURIComponent(after)}`);
      for (const msg of messages) {
        after = msg.createdAt;
        await handleMessage(msg);
      }
    } catch (err) {
      console.error(err);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main();
```

Run it:

```bash
SHALTER_BOT_TOKEN=your-token-here node bot.js
```

Then open a chat with your bot in Shalter and send `/start`. That's the
whole loop — everything else (custom commands, calling out to a real
weather API, an LLM, a database, whatever) is just more code in
`handleMessage`.

## In-app editor (no hosting required)

Settings → Боты → the code icon on your bot opens a real editor (syntax
highlighting + autocomplete for the bot API below) where you write one
function:

```js
async function handleMessage(msg, bot) {
  if (msg.text === "/start") {
    return bot.send("Привет! Я бот, написанный прямо в Shalter.");
  }
  return bot.send("Вы написали: " + msg.text);
}
```

It's called once for every message your bot receives, with:

- `msg.text`, `msg.chatId`, `msg.senderId`, `msg.createdAt` — same fields as
  `/updates` above, for the message that just arrived.
- `bot.send(text, opts?)` — reply in the same chat as `msg`.
- `bot.sendTo(chatId, text, opts?)` — reply in a specific chat (`opts`
  supports `keyboard`/`replyToId`, same shape as `POST /sendMessage`).
- `bot.ai(prompt, opts?)` — ask the server's configured AI, get back its text
  reply. See [AI-powered bots](#ai-powered-bots) below.
- `console.log`/`console.error`/`console.warn` and `fetch` — for calling out
  to an external API, same as anywhere else in JS.

**Сохранить** saves the code; **Запустить** runs it against a test message
(in a real DM between you and the bot, so `bot.send` actually posts a
message you can see) without needing a second device or account. The logs
panel below it shows the last 100 `console.*` calls and errors from both
test runs and real messages, newest first.

## AI-powered bots

Both ways of programming a bot can call a real LLM without the bot's owner
needing their own API key — the deployment sets one key once, and every bot
on it can use `bot.ai()` / `POST /ai`:

```js
async function handleMessage(msg, bot) {
  const reply = await bot.ai(msg.text, {
    system: "Ты дружелюбный бот-помощник Shalter. Отвечай коротко.",
  });
  return bot.send(reply);
}
```

- `prompt` (required) — the user-turn text; up to 8000 characters.
- `opts.system` — an optional system prompt, so your bot has a consistent
  persona/instructions without repeating them in every message.
- `opts.maxTokens` — caps the reply length (default 512, hard ceiling 2048).
- Rate-limited to 12 calls/minute *per bot* — this calls a real, metered API
  using the deployment's own key, so one runaway bot script can't rack up an
  unbounded bill for the person hosting Shalter. A burst past that limit
  throws a catchable error rather than silently queueing.

**Setup (deployment-side, not per-bot):** set the `ANTHROPIC_API_KEY`
environment variable on the server (optionally `ANTHROPIC_MODEL`, defaults to
a fast/cheap model). Until it's set, `bot.ai()`/`POST /ai` fail with a clear
"ИИ не настроен на этом сервере" error instead of silently doing nothing —
if you're self-hosting and want this feature, this is the one thing to add.

### Sandbox limits

This runs in Node's built-in `vm` module — **not a security boundary**
(Node's own docs are explicit about this), only a convenience wrapper around
your own trusted code. There's no `require`, `process`, `Buffer`, or file
access; a run is killed after 20 seconds either way (long enough for a real
`bot.ai()` round-trip, which is the slowest normal thing a bot does). If you need npm
packages, a database, or genuine isolation from the rest of the app, use the
external Bot API instead — the two aren't mutually exclusive, but only one
should call `bot.send`/`sendMessage` for a given bot at a time, or replies
could double up.

## Limits worth knowing

- Bot API calls count against the same general rate limit as the rest of
  Shalter's API (300 requests/5 minutes per IP) — a 2-second poll interval
  uses about half that budget.
- A bot can only message chats it's already a member of. There's currently
  no "bot starts a DM with any user" endpoint — a human has to message the
  bot first (same as Telegram).
- No webhook delivery — polling only. For a low-traffic personal bot this is
  simpler to run (no public URL, no TLS cert to manage) at the cost of a
  couple seconds of reply latency.

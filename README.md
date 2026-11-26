# shalter

A social app: feed, stories, reels, explore, profiles, likes, comments, saves, follows, notifications and direct messages.

Built with Next.js 16 + React 19 + Tailwind CSS 4. Data is stored in a local SQLite database (Node's built-in `node:sqlite`, so there is nothing extra to install) and uploaded photos and videos go to the `uploads/` folder.

## Run it

```bash
npm install
npm run seed     # optional: local seed data, posts, reels, stories and chats (wipes existing data)
npm run dev      # then open http://localhost:3000
```

Create a real account at `/accounts/emailsignup`, then connect additional accounts from the More menu.

### Password recovery and optional Yandex email

Email confirmation is disabled. Password recovery checks the account's email and phone number together, then allows a one-time password change for 30 minutes without sending a letter. Yandex SMTP is optional and is used only for the admin's manual test email; if enabled, copy `.env.example` to `.env.local`, fill in `YANDEX_EMAIL` and `YANDEX_APP_PASSWORD`, then restart the server. shalter uses `smtp.yandex.ru` over SSL on port `465`.

### Production launch

```bash
npm ci
cp .env.example .env.local
# set APP_URL, SNAPGRAM_ADMIN_PHONE and a persistent SNAPGRAM_DB path
npm run check
NODE_ENV=production npm run start -- -p 3000
```

Use a reverse proxy with HTTPS for production WebRTC and Web Push. Set `VAPID_*` when browser push is needed. The SQLite database and `uploads/` directory must be on persistent storage and backed up.

## Features

- **Accounts**: sign up, log in and log out, edit your profile, change your profile photo.
- **Feed**: posts from people you follow, infinite scroll, double-tap to like, photo/video carousels, comments, saves, sharing by DM, and "Suggested for you".
- **Create**: drag and drop up to 10 photos or videos, then add a caption and location. A single video becomes a Reel. You can also post to your Story.
- **Stories**: they expire after 24 hours. Tap to move forward or back, hold to pause. Includes seen/unseen rings, a "Seen by" list, replies by DM, and delete.
- **Reels**: full-screen vertical videos that snap into place and autoplay, with a shared mute setting.
- **Explore**: a grid of popular posts. On desktop, search opens as a side panel and keeps your recent searches.
- **Profile**: post, follower and following counts, follower and following lists, and Posts / Reels / Saved tabs.
- **Notifications**: likes, comments, comment likes and follows, grouped by Today, This week and so on.
- **Messages**: inbox, one-to-one chats that update live (every 2 seconds), shared posts, and unread badges.
- **Groups, channels and live**: group chats, owner-published channels, communities, live rooms and viewer presence.
- **Calls and voice**: WebRTC audio/video calls, microphone recording, reactions, replies, edit/unsend, themes and read states.
- **Security**: phone login, multi-account switching, privacy settings, password changes, secure email reset tokens and an admin panel.
- **Bots**: create a bot in `/bots`, add it to a group or channel through member management, configure `/commands`, then call `POST /api/bots/webhook` with `{ "token", "conversationId", "text" }`. Tokens are shown once and stored hashed.
- **Push**: configure VAPID keys, then enable browser notifications in Settings. New social notifications are delivered through the Service Worker when the browser supports Web Push.
- **Look**: light and dark mode (in the "More" menu), and layouts for desktop, tablet and phone.

## Layout

- `db/schema.sql` — database tables
- `src/app/api/**` — the REST API (route handlers)
- `src/app/(main)/**` — pages that need a logged-in user
- `src/app/(auth)/**` — log in and sign up pages
- `src/components/**` — UI components
- `scripts/seed.mjs` — local seed data

## Phase 1 — Blink statement parser

Parses Blink (Jordan) account statement PDFs into transactions and checks the balances.

```bash
npm run statement:parse -- samples/statement.pdf           # masked summary + validation report
npm run statement:parse -- samples/statement.pdf --rows    # also list every row (masked)
npm run statement:parse -- samples/statement.pdf --json out.json   # full UNMASKED result to a file
npm test                                                   # unit tests
```

- Put real statements in `samples/` (git-ignored). Never commit them.
- Code: `src/lib/statements/blink/`. `parseBlinkStatement(pdfBytes)` returns `{ header, transactions, openingBalanceFils, closingBalanceFils, validation }`.
- Each transaction has: `date`, `direction` (in/out), `type` (transfer | cliq_inward | interest | tax | other), `counterparty`, `cliqReference`, `amountFils`, `balanceFils`, `page`.
- **Money is stored as whole fils** (1 JOD = 1000 fils). Use `formatFils()` to display it.
- **Validation:** the running balance is checked after every row, and closing must equal opening + added − deducted. Problem rows are listed in `validation.rowMismatches`. Unknown row types and missing header fields are listed in `validation.warnings`.
- **Privacy:** the command only ever prints masked values (`******1234`, `R*** S****`). Use `maskAccount`, `maskName` and `maskReference` from `src/lib/statements/mask.ts` in any new code that logs.
- **How rows are rebuilt:** a row starts at a known Details phrase. Wrapped names, the second half of a split date (`2026-08-` + `10`) and amounts attach to the row they belong to, even across a page break. A date or amount that shows up before its row's text is held until that row starts.

## Phase 2 — Synthetic fixtures & seed data

Everything here is **fictional**: random names, invented businesses, fake account numbers and references.

### 2a. Statement fixtures

```bash
npm run fixtures:statements        # writes tests/fixtures/statements/*.pdf + *.expected.json
npm test                           # parses every fixture and checks totals, row counts and validation
```

There are 8 fixtures: basic, page break inside a row (after the 1st, 2nd and 3rd line), very long names, balance hitting 0.000, 130 rows over 8 pages with footers, CliQ/interest/tax rows, a broken running balance, and a broken closing balance. Every page has a **SYNTHETIC TEST DATA** watermark. The fixtures have the same structure as a Blink statement, but no bank branding. To regenerate with a different seed: `npm run fixtures:statements -- --seed 7`.

### 2b. Business chats, orders and invoices

```bash
npm run seed:business -- --owner a7mad --businesses 8 --conversations 2 \
  --from 2026-05-01 --to 2026-09-30 --seed 42 [--statement tests/fixtures/reconciliation/seed-42.pdf]
npm run seed:business:clean        # deletes every is_seed row, nothing else
```

| Option | Meaning |
|---|---|
| `--owner` | existing account that plays the freelance developer (default `demo`) |
| `--owner-name` | what businesses call the owner in chats (default: first word of the account name) |
| `--businesses` | how many fictional businesses (max 16, about a third are vendors) |
| `--conversations` | orders per business, all in one chat thread (2+ makes them repeat clients) |
| `--from`, `--to` | date range for the messages |
| `--seed` | random seed: the same seed gives the same plan |
| `--statement out.pdf` | also write a synthetic statement whose transfers pay the seeded invoices, plus `out.expected-matches.json` (used by Phase 3 tests) |

- **Scenario A (clients):** request → requirements → quote → negotiation → agreement (sometimes a 50% deposit) → progress and feedback → delivery → invoice card → CliQ payment. Repeat clients sometimes pay two invoices with one transfer.
- **Scenario B (vendors):** the developer buys hosting, domains, accessories, design work, courses or licenses → pays by CliQ → receipt card.
- **Language and realism:** Jordanian Arabic with English tech terms, occasional typos and emojis, voice-note placeholders, messages only between 9:00 and 23:30 Amman time, and read receipts (some threads are left unread or unseen).
- **Database changes** (`db/migrate.mjs`, applied automatically): new `orders`, `order_items`, `invoices` and `invoice_items` tables, `messages.kind`, `invoice_id`, `voice_seconds`, `users.is_business` and `business_category`, and `is_seed` on every seeded table. Invoice cards show **TEST DATA · NOT A REAL INVOICE** when `is_seed = 1`.
- **Safety:** both commands refuse to run when `NODE_ENV` or `APP_ENV` (from the environment or `.env` / `.env.local`) is `production`. The seed won't reuse a username that belongs to a real (non-seed) account. Set `SNAPGRAM_DB=path/to/file.db` to point any script at a different database.
- **Note:** cleanup deletes the seeded business accounts. Anything a real account did *with* those fake accounts outside the seeded threads (for example a new chat you started with one of them) is deleted along with them.

## Phase 3 — Reconciliation (match transfers to orders)

Open **More → Reconciliation** (`/reconcile`), drop in a statement PDF, and review the matches.

- **What gets written:** only `statement_imports`, `statement_transactions` and `reconciliation_links`. Orders, invoices, messages and users are read-only to this feature, and a test proves they're unchanged after import, match, confirm, reject, notes and delete. Each link stores `transaction_id`, `order_id`, the amount allocated, `confidence`, `level` (auto/suggested), `status` (pending/confirmed/rejected), `confirmed_by` and `confirmed_at`.
- **Matching** (`src/lib/reconcile/match.ts`, pure functions):
  - Incoming transfers are matched to orders where you're the seller, outgoing ones to orders where you're the buyer. Interest and tax rows are "not applicable".
  - Candidates need an **exact amount**, and a date within the **window** (±3 days by default, adjustable) of the order's created, invoiced or paid date.
  - Score = amount 0.4 + date closeness 0.2 + **name similarity** 0.4. Name similarity works across Arabic and Latin spellings (`src/lib/reconcile/names.ts`). A CliQ reference that matches the one on the invoice lifts the score to 0.97.
  - **Shapes handled:** 1 transfer → 1 order; 1 transfer → 2–3 orders of the same party; 2–3 transfers → 1 order (deposit + balance); 2 transfers → 2 orders of one party.
  - **auto** means confidence ≥ 0.85 with no close competitor. **suggested** means 0.55 or more, or a close competitor exists. Anything else is **unmatched**.
  - Rejected pairs are never proposed again. **Find more matches** re-runs matching only for rows without an active link.
- **Review screen:**
  - Tabs: *To review*, *Matched*, *Unmatched*, *All*.
  - Each link shows the order, the business (linked to the chat), invoice numbers, confidence and reasons, with Confirm / Reject / Undo.
  - Unmatched rows have a free-text note that only you write.
- **Export:**
  - **CSV** (`/api/reconcile/<id>/export`, UTF-8 with BOM so Excel shows Arabic) lists each transaction with its linked order IDs, invoices, status, confidence, who confirmed it, and your note.
  - **PDF** is the printable report (`/reconcile/<id>/report`): choose *Save as PDF* in the print dialog. It's done in the browser because it lays out Arabic names and notes correctly.
- **Privacy:** the uploaded PDF isn't saved. Only parsed rows are stored, with the account number masked. Parse errors are never logged.
- **Accuracy on synthetic data** (30 random seeds, 901 payments plus decoys): 96.3% of payments linked to exactly the right orders, 0 wrong auto-matches, 0 decoys linked. The misses are left *unmatched* for manual review. They're payment shapes beyond the search (for example a deposit, then one transfer paying three invoices).
- **Tests:** `tests/reconcile/` covers name matching, every match shape, the date window, ambiguity, rejected pairs, and a full seed → statement → parse → match run that checks against the known answers and that protected tables are unchanged.

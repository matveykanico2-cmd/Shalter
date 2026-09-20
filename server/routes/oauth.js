const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser } = require("../data/users");
const {
  createOAuthApp,
  listOAuthAppsByOwner,
  getOAuthAppByClientId,
  deleteOAuthApp,
  createAuthCode,
  redeemAuthCode,
  issueAccessToken,
  getTokenOwner,
} = require("../data/oauthApps");

// "Войти через Shalter" — a small OAuth-authorization-code flow so another
// site can let people sign in with their Shalter account, the same idea as
// "Войти через VK"/"Sign in with Google". Deliberately minimal: one grant
// type (authorization code), no refresh tokens, no scopes — a third-party
// app gets exactly one thing, the account's public profile (id/name/
// username/avatar), never anything private.
//
// Flow:
//  1. Third-party site sends the browser to
//     https://<this app>/oauth/authorize?client_id=...&redirect_uri=...&state=...
//     (a client-side route — public/js/router.js's "/oauth/authorize" —
//     which renders the consent screen; requireUserId below only gates the
//     API calls that screen makes, not the page itself).
//  2. Account approves → browser is redirected to
//     <redirect_uri>?code=...&state=...
//  3. Third-party's own SERVER exchanges the code for an access token via
//     POST /api/oauth/token (with client_secret — never exposed to the
//     browser), then calls GET /api/oauth/userinfo with that token.
const router = express.Router();

// Only what a third-party site needs to know is public here, never a
// secret. `avatarImage` is already a self-contained data:/uploads URL, not
// something that needs a signed request.
function publicProfile(user) {
  return { id: user.id, name: user.name, username: user.username || null, avatarImage: user.avatarImage || null };
}

// ── Server-to-server (no Shalter session — the third-party's backend calls
// these directly, authenticated by client_secret / access token instead) ──

router.post(
  "/token",
  asyncRoute(async (req, res) => {
    const { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri } = req.body ?? {};
    const app = clientId ? getOAuthAppByClientId(String(clientId)) : null;
    if (!app || app.clientSecret !== clientSecret) {
      return res.status(401).json({ error: "invalid_client" });
    }
    const redeemed = redeemAuthCode(String(code ?? ""), app.clientId, String(redirectUri ?? ""));
    if (!redeemed) return res.status(400).json({ error: "invalid_grant" });

    const user = await getUser(redeemed.userId);
    if (!user) return res.status(400).json({ error: "invalid_grant" });

    const accessToken = issueAccessToken({ clientId: app.clientId, userId: user.id });
    // The profile rides along in the same response — saves the third-party
    // an extra round trip for the common case of "just log them in", while
    // /userinfo below still exists for re-checking the token later.
    res.json({ access_token: accessToken, token_type: "bearer", user: publicProfile(user) });
  })
);

router.get(
  "/userinfo",
  asyncRoute(async (req, res) => {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    const owner = token ? getTokenOwner(token) : null;
    if (!owner) return res.status(401).json({ error: "invalid_token" });
    const user = await getUser(owner.userId);
    if (!user) return res.status(401).json({ error: "invalid_token" });
    res.json(publicProfile(user));
  })
);

// ── Everything below needs a logged-in Shalter account ──────────────────
router.use(requireUserId);

// What the consent screen shows before the account approves — validated
// against the app's own registered redirect_uri so a third-party can't
// silently redirect the code somewhere else by tweaking the query string.
router.get(
  "/app-info",
  asyncRoute(async (req, res) => {
    const app = getOAuthAppByClientId(String(req.query.client_id ?? ""));
    if (!app || app.redirectUri !== req.query.redirect_uri) {
      return res.status(404).json({ error: "Приложение не найдено или redirect_uri не совпадает" });
    }
    res.json({ name: app.name });
  })
);

// Approving the consent screen — mints the code the third-party will
// exchange at /token. Re-validates redirect_uri for the same reason
// /app-info does.
router.post(
  "/authorize",
  asyncRoute(async (req, res) => {
    const { client_id: clientId, redirect_uri: redirectUri, state } = req.body ?? {};
    const app = clientId ? getOAuthAppByClientId(String(clientId)) : null;
    if (!app || app.redirectUri !== redirectUri) {
      return res.status(404).json({ error: "Приложение не найдено или redirect_uri не совпадает" });
    }
    const code = createAuthCode({ clientId: app.clientId, userId: req.uid, redirectUri: String(redirectUri) });
    const url = new URL(String(redirectUri));
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", String(state));
    res.json({ redirectUrl: url.toString() });
  })
);

// ── Managing your own registered apps (Settings → «Войти через Shalter») ─

router.get(
  "/apps",
  asyncRoute(async (req, res) => {
    res.json({ apps: await listOAuthAppsByOwner(req.uid) });
  })
);

router.post(
  "/apps",
  asyncRoute(async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const redirectUri = String(req.body?.redirectUri ?? "").trim();
    if (!name) return res.status(400).json({ error: "Укажите название приложения" });
    let parsed;
    try {
      parsed = new URL(redirectUri);
    } catch {
      return res.status(400).json({ error: "redirect_uri должен быть полным адресом (https://...)" });
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return res.status(400).json({ error: "redirect_uri должен быть https:// (кроме localhost для разработки)" });
    }
    const app = await createOAuthApp({ ownerId: req.uid, name, redirectUri });
    res.json({ app }); // includes clientSecret — shown once, at creation
  })
);

router.delete(
  "/apps/:id",
  asyncRoute(async (req, res) => {
    const ok = await deleteOAuthApp(req.params.id, req.uid);
    if (!ok) return res.status(404).json({ error: "Приложение не найдено" });
    res.json({ ok: true });
  })
);

module.exports = router;

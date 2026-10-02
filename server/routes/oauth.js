const express = require("express");
const { asyncRoute } = require("../middleware/errors");
const { requireUserId } = require("../middleware/auth");
const { getUser } = require("../data/users");
const {
  createOAuthApp,
  listOAuthAppsByOwner,
  getOAuthAppByClientId,
  getOAuthAppSecret,
  deleteOAuthApp,
  regenerateOAuthAppSecret,
  createAuthCode,
  redeemAuthCode,
  issueAccessToken,
  getTokenOwner,
} = require("../data/oauthApps");

const router = express.Router();

function publicProfile(user) {
  return { id: user.id, name: user.name, username: user.username || null, avatarImage: user.avatarImage || null };
}

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

router.use(requireUserId);

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
    res.json({ app });
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

router.get(
  "/apps/:id/secret",
  asyncRoute(async (req, res) => {
    const creds = await getOAuthAppSecret(req.params.id, req.uid);
    if (!creds) return res.status(404).json({ error: "Приложение не найдено" });
    res.json(creds);
  })
);

router.post(
  "/apps/:id/regenerate",
  asyncRoute(async (req, res) => {
    const app = await regenerateOAuthAppSecret(req.params.id, req.uid);
    if (!app) return res.status(404).json({ error: "Приложение не найдено" });
    res.json({ app });
  })
);

module.exports = router;

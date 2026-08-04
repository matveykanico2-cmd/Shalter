# Packaging Shalter as a native app (RuStore, Google Play, App Store)

Shalter is a server-backed app (WebSocket signaling, SQLite, sessions — see
AGENTS.md) — not a static site — so the native wrapper here isn't "bundle the
files into the app," it's "point a native WebView shell at your already-
deployed HTTPS server" (see DEPLOY.md for getting that server running with a
real domain and TLS first; you need that *before* any of this). The shell is
[Capacitor](https://capacitorjs.com/): one config (`capacitor.config.json` at
the repo root), one Android project and one Xcode project, both loading the
same live URL.

This repo has the config and npm scripts wired up (`@capacitor/core` and
`@capacitor/cli` are already in `devDependencies`), but the actual native
projects (`android/`, `ios/`) aren't generated here — that step needs Android
Studio / Xcode installed locally, which this environment doesn't have. Nothing
below is push-button; each platform needs its own machine and its own store
account.

## 1. Point it at your real server

Edit `capacitor.config.json`:

```json
"server": { "url": "https://your-real-domain.example", "cleartext": false }
```

This has to be the same HTTPS domain from DEPLOY.md, already serving traffic
— the app just opens this URL in a native WebView instead of a browser tab.
`webDir` (`public/dist`) is only there because Capacitor's CLI requires *some*
directory to exist; with `server.url` set, its contents are never actually
shown.

## Android (works for both RuStore and Google Play — same APK/AAB)

Needs: Android Studio (which bundles the Android SDK + a JDK) installed
locally.

```bash
npm run cap:add:android   # generates android/ — do this once
npm run cap:open:android  # opens the project in Android Studio
```

From Android Studio: **Build → Generate Signed Bundle / APK**. Create a
keystore the first time (back it up — losing it means you can never update
the app under the same listing again) and build an AAB for Google Play or an
APK for RuStore (RuStore's console also accepts AAB).

- **RuStore**: submit via [RuStore Console](https://console.rustore.ru/) — a
  RuStore developer account is required, separate from Google's.
- **Google Play**: submit via the [Play Console](https://play.google.com/console/) —
  needs the one-time Google Play developer registration fee.

Either store also wants: a privacy policy URL, a support email/phone, and a
few screenshots — the ones already taken of `/login` and Settings → Premium
during this session work as a starting point.

## iOS (App Store)

Needs: a Mac with Xcode installed and an active Apple Developer Program
membership (paid, required to submit). This genuinely cannot be done from a
Linux machine — Xcode doesn't run there, and Apple doesn't offer a
cross-compilation path.

```bash
npm run cap:add:ios     # generates ios/ — run this on the Mac
npm run cap:open:ios    # opens the project in Xcode
```

From Xcode: set your Apple Developer Team under Signing & Capabilities, then
**Product → Archive**, and submit through the Organizer window (which talks
to App Store Connect directly).

## Push notifications inside the native shell

The web app already does push via the standard Web Push API (`server/push.js`,
`public/js/lib/push.js`) — that keeps working as-is inside Capacitor's WebView
on Android. iOS Safari/WKWebView's Web Push support is newer and more
restricted; if push turns out unreliable there, the fix is swapping in
`@capacitor/push-notifications` (APNs-backed) for the iOS build specifically,
not rewriting the whole push system.

## What's already done vs. what's still yours to do

Done in this repo: the PWA manifest + icons + service worker (installable via
"Add to Home Screen" on every platform *today*, no store needed), the
Capacitor config, and the `cap:*` npm scripts.

Still needed, and only possible on the right hardware: generating the
`android/`/`ios/` projects, signing, store listings (icons at store-required
sizes, screenshots, privacy policy, descriptions), and the actual submission
review process on each store.

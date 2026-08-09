# Packaging Shalter as a native app (RuStore, Google Play, App Store)

Shalter is a server-backed app (WebSocket signaling, SQLite, sessions — see
AGENTS.md) — not a static site — so the native wrapper here isn't "bundle the
files into the app," it's "point a native WebView shell at your already-
deployed HTTPS server" (see DEPLOY.md for getting that server running with a
real domain and TLS first; you need that *before* any of this). The shell is
[Capacitor](https://capacitorjs.com/): one config (`capacitor.config.json` at
the repo root), one Android project and one Xcode project, both loading the
same live URL.

This repo has the config and npm scripts wired up (`@capacitor/core`,
`@capacitor/cli`, `@capacitor/android`, `@capacitor/ios` are all in
`devDependencies`), and `npx cap add android`/`add ios` do successfully
generate the native projects — verified in this repo. Actually *compiling*
them needs Android Studio / Xcode installed locally, which this environment
doesn't have, so that step (and everything past it — signing, store
submission) is still yours to do on the right hardware. Nothing below is
push-button; each platform needs its own machine and its own store account.

**Don't have that hardware yet?** `.github/workflows/build-android.yml` and
`.github/workflows/build-ios.yml` build both from GitHub's own runners (which
do have the SDK/Xcode preinstalled) — an unsigned debug APK you can
side-load today, and an iOS Simulator build that at least proves the native
project compiles. Neither replaces the signed, store-ready builds below, but
both get you something to actually run before you're at a Mac/Android Studio.

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

Two ways to get a **signed** release APK (RuStore/Google Play both reject an
unsigned or debug one):

### Option A — Android Studio locally

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

### Option B — signed builds from CI, no local Android Studio needed

`.github/workflows/build-android.yml` builds a signed release APK
automatically once these four repo secrets are set (repo → Settings →
Secrets and variables → Actions → New repository secret):

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | your keystore file, base64-encoded (`base64 -w0 release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore's password |
| `ANDROID_KEY_ALIAS` | the key alias inside it |
| `ANDROID_KEY_PASSWORD` | that key's password |

No keystore already? Generate one anywhere with a JDK (works fine in
Termux, no Android Studio needed):

```bash
keytool -genkeypair -v -keystore release.keystore -alias shalter \
  -keyalg RSA -keysize 2048 -validity 10000
```

**Back up `release.keystore` and both passwords somewhere durable outside
this repo before anything else** — this file's whole job is proving future
updates come from you; losing it means starting a brand-new store listing
from scratch. Once the four secrets are set, every push of a `v*` tag (or a
manual run from the Actions tab) uploads a `shalter-android-release-apk`
artifact ready to hand straight to RuStore/Google Play.

### Submitting

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

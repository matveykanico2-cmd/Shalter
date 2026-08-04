# Packaging Shalter as a desktop app (Windows, Linux, macOS)

Same idea as [DEPLOY_MOBILE.md](DEPLOY_MOBILE.md): Shalter is a server-backed
app (WebSocket signaling, SQLite, sessions — see AGENTS.md), so the desktop
build isn't "bundle the app and run it standalone," it's "open a native
window pointed at your already-deployed HTTPS server" (get that running via
DEPLOY.md first). The shell is [Electron](https://www.electronjs.org/)
(`electron/main.js`) — one `BrowserWindow` loading the same live URL, for
all three OSes from one codebase.

`electron` and `electron-builder` are already in `devDependencies`, and
`npm run electron:*` scripts are wired up in `package.json`. Linux packaging
was built and verified end-to-end in this repo (see below); Windows and
macOS builds need to run on their own OS (or CI) — cross-building an NSIS
installer or a signed .dmg from Linux isn't realistic (no Wine/codesign here).

## 1. Point it at your real server

Desktop reuses `capacitor.config.json`'s `server.url` — the same one edit
covers mobile and desktop:

```json
"server": { "url": "https://your-real-domain.example" }
```

## Try it locally first (any OS, against `npm run dev`)

```bash
npm run dev          # starts the Express server on :3000
npm run electron:dev # opens a window pointed at http://localhost:3000
```

This is how the window and login screen were actually verified working
during development — `electron/main.js` reads `SHALTER_APP_URL` first (set by
`electron:dev`) before falling back to `capacitor.config.json`.

## Linux — built and verified here

```bash
npm run electron:build:linux
```

Produces an AppImage and a `.deb` under `dist-electron/`. Verified in this
repo: `electron-builder --linux --dir` successfully produced a working
`dist-electron/linux-unpacked/shalter` executable with the app code
(`electron/main.js`, `capacitor.config.json`) correctly bundled — `npmRebuild:
false` in `package.json`'s `build` config is required here, otherwise
electron-builder tries to rebuild `better-sqlite3` (a *server*-only native
dependency the desktop shell never touches) for Electron's ABI and fails
without a C toolchain (`make`/`node-gyp`) installed.

## Windows

Needs to run on Windows (or Linux/macOS with Wine installed — electron-builder
uses it to edit the .exe's icon/resources for NSIS):

```bash
npm run electron:build:win
```

Produces an NSIS installer (`Shalter Setup.exe`) under `dist-electron/`.
Unsigned installers trigger a Windows SmartScreen warning on first run — a
code-signing certificate (EV or standard, from any CA) removes that, applied
via electron-builder's `win.certificateFile`/`certificatePassword` config.

## macOS

Needs an actual Mac with Xcode's command-line tools, same hard requirement
as iOS in DEPLOY_MOBILE.md — Apple's toolchain doesn't run on Linux:

```bash
npm run electron:build:mac
```

Produces a `.dmg` and a `.zip` under `dist-electron/`. Distributing outside
the Mac App Store still requires **notarization** (an Apple Developer
Program membership, `xcrun notarytool`) or Gatekeeper blocks the app on
first launch — electron-builder automates this via `afterSign` hooks once
you have Apple credentials configured locally.

## Building all three from one machine

Not really possible correctly — Windows needs Wine (or a Windows box) and
macOS needs an actual Mac. The standard fix is CI: a GitHub Actions workflow
with a build matrix (`windows-latest`, `macos-latest`, `ubuntu-latest`) each
running its own `npm run electron:build:*`, uploading the three artifacts.
Not set up in this repo — worth doing once you're ready to publish
regularly, not needed just to try the app locally.

## What's already done vs. what's still yours to do

Done: `electron/main.js`, the icon, the `build` config in `package.json`,
the npm scripts, and a verified working Linux package.

Still needed: an icon at each platform's preferred format if you want
something sharper than electron-builder's auto-generated one (`.ico` for
Windows, `.icns` for macOS — currently generated on the fly from
`electron/icon.png`), code signing for both Windows and macOS, and actually
running the Windows/macOS builds on the right hardware (or setting up the CI
matrix above).

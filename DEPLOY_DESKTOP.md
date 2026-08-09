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

## Getting the builds onto the download page

`public/download.html` (served at `/download.html`) links each platform to a
file under `public/downloads/`. How each one gets there differs by size, and
the split is not arbitrary:

| File | Size | How it reaches the server |
|---|---|---|
| `Shalter.apk` | ~1MB | committed → arrives with `git pull` |
| `Shalter-Windows.zip` | ~1MB | committed → arrives with `git pull` |
| `Shalter.AppImage` | ~119MB | gitignored → `./scripts/upload-downloads.sh` |
| `Shalter.deb` | ~82MB | gitignored → `./scripts/upload-downloads.sh` |

The two Electron builds can't be committed: GitHub hard-rejects any file
over 100MB (the AppImage is past it, so the `git push` itself would fail),
and the .deb alone would permanently grow an 11MB repo by 8x — git history
never drops a blob once it's in. So after building them:

```bash
npm run electron:build:linux
./scripts/upload-downloads.sh            # rsyncs both to the server
SERVER=user@host APP_DIR=/opt/shalter ./scripts/upload-downloads.sh   # or override
```

Until that runs, the Linux buttons on the download page 404 while Windows
and Android work — worth checking after a fresh deploy to a new server.

One caveat worth knowing: serving a 119MB file from the app itself puts that
traffic through the same small box running the messenger (DEPLOY.md sizes it
at 2 cores/2GB). Fine at a trickle, but if Linux downloads ever pick up,
move those two files to GitHub Releases (2GB/file, free CDN) and point the
page's `href` there instead — the page is plain HTML, it's a two-line edit.

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
macOS needs an actual Mac. The fix is CI: **`.github/workflows/build-desktop.yml`**
is exactly that — a build matrix (`windows-latest`, `macos-latest`,
`ubuntu-latest`) each running its own `npm run electron:build:*` on GitHub's
own machines (which actually have Wine and a real Mac, unlike this repo's own
dev environment) and uploading the three artifacts. Trigger it from the
Actions tab (workflow_dispatch) or by pushing a `v*` tag; download the
`shalter-desktop-*` artifacts from the run once it's green. These builds are
unsigned (see the signing notes above) — fine for testing, not for handing to
real users yet.

## What's already done vs. what's still yours to do

Done: `electron/main.js`, the icon, the `build` config in `package.json`,
the npm scripts, a verified working Linux package (both `.AppImage` and
`.deb`, built and tested in this repo), and the
`.github/workflows/build-desktop.yml` CI matrix that gets you unsigned
Windows/macOS/Linux builds without needing that hardware yourself.

Still needed: an icon at each platform's preferred format if you want
something sharper than electron-builder's auto-generated one (`.ico` for
Windows, `.icns` for macOS — currently generated on the fly from
`electron/icon.png`), and code signing for both Windows and macOS once
you're ready to distribute past your own testing (SmartScreen/Gatekeeper
otherwise warn on first launch).

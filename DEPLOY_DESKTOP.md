# Packaging Shalter as a desktop app (Windows, Linux, macOS)

Same idea as [DEPLOY_MOBILE.md](DEPLOY_MOBILE.md): Shalter is a server-backed
app (WebSocket signaling, SQLite, sessions — see AGENTS.md), so the desktop
build isn't "bundle the app and run it standalone," it's "open a native
window pointed at your already-deployed HTTPS server" (get that running via
DEPLOY.md first).

The shell is [Tauri 2](https://v2.tauri.app/) (`src-tauri/`). Unlike the
Electron shell it replaced, it does **not** ship its own Chromium: the page is
rendered by the OS's own web engine — WebKitGTK on Linux, WKWebView (Safari's
engine) on macOS, WebView2 on Windows (preinstalled on Windows 10/11). Builds
are ~5–15MB instead of ~100–120MB, and use far less memory.

What `src-tauri/src/main.rs` does (feature parity with the old Electron shell):

- one window loading the live server; own-origin links stay in it, everything
  else opens in the default browser;
- `ui/index.html` — a local start page that checks the server is reachable and
  shows "Ожидание сети…" with auto-retry when it isn't;
- tray icon with the unread count (closing the window hides to tray), Dock /
  Unity badge, taskbar attention flash on Windows;
- `window.shalterDesktop` bridge (`setUnread`, `focus`, `notify`, `retry`) —
  injected only into the app's own origin, and only those commands are allowed
  over IPC for it (runtime capability in `main.rs`, command permissions from
  `build.rs`);
- single instance, `shalter://` links, remembered window size/position;
- system notifications, also for the page's own `Notification` API.

Not carried over: the custom right-click menu (the system WebView's own one is
used) and clicking a desktop notification to open a specific chat (Tauri's
notification plugin doesn't report clicks on desktop).

## 1. Point it at your real server

Desktop reuses `capacitor.config.json`'s `server.url` (read at compile time) —
the same one edit covers mobile and desktop:

```json
"server": { "url": "https://your-real-domain.example" }
```

`SHALTER_APP_URL` overrides it at runtime.

## 2. Toolchain (once per machine)

- Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Linux: `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf build-essential`
- macOS: Xcode command-line tools. Windows: Microsoft C++ Build Tools.

## Try it locally (against `npm run dev`)

```bash
npm run dev          # Express server on :3000
npm run desktop:dev  # Tauri window pointed at http://localhost:3000
```

## Build

```bash
npm run desktop:build
```

`tauri build` only targets the OS (and CPU architecture) it runs on, then
`scripts/collect-desktop.js` copies the result into `public/downloads/` under
the names the download page expects:

| OS | File |
|---|---|
| Linux | `Shalter.AppImage`, `Shalter.deb` |
| Windows | `Shalter-Windows-Setup.exe` (NSIS, per-user install, no admin) |
| macOS | `Shalter-macOS-arm64.zip` / `Shalter-macOS-x64.zip` (zipped `.app`) |

## Building all platforms: CI

**`.github/workflows/build-desktop.yml`** runs `npm run desktop:build` on
`ubuntu-22.04`, `windows-latest`, `macos-latest` (Apple Silicon) and `macos-13`
(Intel). Trigger it from the Actions tab or by pushing a `v*` tag (which also
attaches the files to a GitHub Release).

## Getting the builds onto the download page

`Shalter.apk` (~1MB) is committed and arrives with `git pull`. The desktop
builds are gitignored (binaries would grow the repo's history every release);
after building, upload whichever ones you have:

```bash
./scripts/upload-downloads.sh
SERVER=user@host APP_DIR=/opt/shalter ./scripts/upload-downloads.sh   # or override
```

## Code signing

Builds are unsigned: Windows shows SmartScreen and macOS Gatekeeper blocks the
app on first launch. Removing that needs a code-signing certificate (Windows,
`bundle.windows.certificateThumbprint` in `src-tauri/tauri.conf.json`) and an
Apple Developer membership for signing + notarization (`APPLE_*` env vars that
`tauri build` picks up) — see Tauri's distribution docs.

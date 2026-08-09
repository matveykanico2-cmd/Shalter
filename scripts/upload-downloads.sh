#!/usr/bin/env bash
# Uploads the big Electron desktop builds to the deployed server's
# public/downloads/, which is what public/download.html's Linux buttons
# link to.
#
# Why this exists instead of just committing them: Shalter.AppImage is
# ~119MB (Electron bundles all of Chromium), past GitHub's hard 100MB
# per-file limit — the push itself would be rejected — and the ~82MB .deb
# would permanently balloon an 11MB repo. So they're gitignored, and a
# `git pull` deploy on the server brings everything EXCEPT these two. This
# script is that missing step.
#
# The small PWABuilder wrappers (Shalter.apk, Shalter-Windows.zip) are ~1MB
# each and ARE committed, so they arrive with a normal `git pull` — nothing
# to do for those.
#
# Usage (from the repo root, after `npm run electron:build:linux`):
#   ./scripts/upload-downloads.sh
#   SERVER=user@1.2.3.4 APP_DIR=/opt/shalter ./scripts/upload-downloads.sh
set -euo pipefail

SERVER="${SERVER:-shalter@31.40.154.105}"
APP_DIR="${APP_DIR:-/opt/shalter}"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist-electron"
FILES=(Shalter.AppImage Shalter.deb)

missing=0
for f in "${FILES[@]}"; do
  if [[ ! -f "$SRC_DIR/$f" ]]; then
    echo "нет файла: $SRC_DIR/$f" >&2
    missing=1
  fi
done
if [[ $missing -eq 1 ]]; then
  echo >&2
  echo "Сначала соберите их:  npm run electron:build:linux" >&2
  exit 1
fi

echo "Загружаю на $SERVER:$APP_DIR/public/downloads/ ..."
ssh "$SERVER" "mkdir -p '$APP_DIR/public/downloads'"

for f in "${FILES[@]}"; do
  echo "  → $f"
  # rsync over scp for the progress bar and, more usefully, --partial:
  # a dropped connection mid-119MB-transfer resumes instead of restarting.
  rsync -h --progress --partial "$SRC_DIR/$f" "$SERVER:$APP_DIR/public/downloads/$f"
done

echo
echo "Готово. Проверьте:"
echo "  curl -sI https://shalter.ru/downloads/Shalter.AppImage | head -1"
echo "  curl -sI https://shalter.ru/downloads/Shalter.deb | head -1"

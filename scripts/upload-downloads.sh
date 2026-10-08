#!/usr/bin/env bash
# Uploads the desktop builds (Tauri, ~5–15MB each) to the deployed server's
# public/downloads/, which is what public/download.html's buttons link to.
# They're gitignored (binaries would permanently grow the repo's history), so
# a `git pull` deploy brings everything EXCEPT these; this script is that step.
# Маленький Shalter.apk закоммичен и приходит с git pull.
#
# Tauri собирает только под свою ОС, поэтому загружаем те сборки, что есть.
#
# Usage (from the repo root, after `npm run desktop:build`):
#   ./scripts/upload-downloads.sh
#   SERVER=user@1.2.3.4 APP_DIR=/opt/shalter ./scripts/upload-downloads.sh
set -euo pipefail

SERVER="${SERVER:-shalter@31.40.154.105}"
APP_DIR="${APP_DIR:-/opt/shalter}"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/downloads"
FILES=(Shalter.AppImage Shalter.deb Shalter-Windows-Setup.exe Shalter-macOS-arm64.zip)

present=()
for f in "${FILES[@]}"; do
  if [[ -f "$SRC_DIR/$f" ]]; then present+=("$f"); else echo "пропускаю (не собран): $f" >&2; fi
done
if [[ ${#present[@]} -eq 0 ]]; then
  echo "Нет ни одной сборки. Сначала:  npm run desktop:build" >&2
  exit 1
fi
FILES=("${present[@]}")

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

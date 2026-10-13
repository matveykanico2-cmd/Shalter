#!/bin/sh
# Установка Shalter на Linux без sudo: скачивает AppImage в ~/.local/share/shalter,
# добавляет ярлык в меню приложений и иконку. Повторный запуск — обновление.
#   curl -fsSL https://shalter.ru/install-linux.sh | sh
set -eu
BASE="${SHALTER_URL:-https://shalter.ru}"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DIR="$DATA/shalter"
APP="$DIR/Shalter.AppImage"

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q --show-progress -O "$2" "$1"
  else echo "Нужен curl или wget" >&2; exit 1; fi
}

echo "Скачиваем Shalter…"
mkdir -p "$DIR" "$DATA/applications" "$DATA/icons/hicolor/192x192/apps"
fetch "$BASE/downloads/Shalter.AppImage" "$APP.new"
chmod +x "$APP.new"
mv -f "$APP.new" "$APP"
fetch "$BASE/icons/icon-192.png" "$DATA/icons/hicolor/192x192/apps/shalter.png" 2>/dev/null || true

cat > "$DATA/applications/shalter.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Shalter
Comment=Мессенджер Shalter
Exec="$APP" %u
Icon=shalter
Terminal=false
Categories=Network;InstantMessaging;Chat;
MimeType=x-scheme-handler/shalter;
StartupWMClass=shalter
StartupNotify=true
DESKTOP
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true

# AppImage на новых Ubuntu требует libfuse2 — подскажем, если её нет.
if ! ldconfig -p 2>/dev/null | grep -q "libfuse.so.2"; then
  echo
  echo "⚠ Для запуска AppImage нужна библиотека FUSE 2. Установите её:"
  echo "   sudo apt install libfuse2t64   # Ubuntu 24.04+  (или libfuse2 на старых)"
fi

echo
echo "✅ Shalter установлен — ищите его в меню приложений."
echo "   Удалить: rm -rf \"$DIR\" \"$DATA/applications/shalter.desktop\""

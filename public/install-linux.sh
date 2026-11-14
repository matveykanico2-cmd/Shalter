#!/bin/sh
# Установка Shalter на Linux без sudo
set -eu
BASE="${SHALTER_URL:-https://shalter.ru}"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DIR="$DATA/shalter"
BIN="$DIR/usr/bin/shalter"
APP="$DIR/shalter"

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q --show-progress -O "$2" "$1"
  else echo "Нужен curl или wget" >&2; exit 1; fi
}

echo "Скачиваем Shalter…"
mkdir -p "$DIR" "$DATA/applications" "$DATA/icons/hicolor/192x192/apps"

PACKAGE_OK=0
if fetch "$BASE/downloads/Shalter.deb" "$DIR/Shalter.deb" 2>/dev/null; then
  if head -c 8 "$DIR/Shalter.deb" 2>/dev/null | grep -q "!<arch>"; then
    rm -rf "$DIR/usr"
    (cd "$DIR" && (dpkg-deb -x "$DIR/Shalter.deb" "$DIR" 2>/dev/null || (ar x "$DIR/Shalter.deb" && tar xf data.tar.* 2>/dev/null)))
    APP="$BIN"
    PACKAGE_OK=1
  else
    rm -f "$DIR/Shalter.deb"
  fi
fi

if [ "$PACKAGE_OK" = "0" ]; then
  echo "Не удалось скачать Shalter. Попробуйте позже." >&2
  exit 1
fi

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

echo
echo "Shalter установлен — ищите его в меню приложений."
echo "   Запуск: $APP"
echo "   Удалить: rm -rf \"$DIR\" \"$DATA/applications/shalter.desktop\""

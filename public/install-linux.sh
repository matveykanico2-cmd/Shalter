#!/bin/sh
# Установка Shalter на Linux без sudo: скачивает deb-пакет, распаковывает его в
# ~/.local/share/shalter и добавляет ярлык в меню приложений. Повторный запуск — обновление.
#   curl -fsSL https://shalter.ru/install-linux.sh | sh
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

# Пробуем AppImage, при его отсутствии — deb.
APPIMAGE_OK=0
if fetch "$BASE/downloads/Shalter.AppImage" "$DIR/Shalter.AppImage.new" 2>/dev/null; then
  # Проверяем, что это действительно AppImage (ELF), а не HTML-заглушка сервера.
  if head -c 4 "$DIR/Shalter.AppImage.new" 2>/dev/null | grep -q "ELF"; then
    chmod +x "$DIR/Shalter.AppImage.new"
    mv -f "$DIR/Shalter.AppImage.new" "$DIR/Shalter.AppImage"
    APP="$DIR/Shalter.AppImage"
    APPIMAGE_OK=1
  else
    rm -f "$DIR/Shalter.AppImage.new"
  fi
fi
if [ "$APPIMAGE_OK" = "0" ]; then
  if ! fetch "$BASE/downloads/Shalter.deb" "$DIR/Shalter.deb" 2>/dev/null; then
    echo "Не удалось скачать Shalter. Попробуйте позже." >&2
    exit 1
  fi
  # Проверяем, что это действительно deb (ar-архив), а не HTML-заглушка.
  if ! head -c 8 "$DIR/Shalter.deb" 2>/dev/null | grep -q "!<arch>"; then
    echo "Файл Shalter.deb на сервере недоступен. Обратитесь к администратору." >&2
    rm -f "$DIR/Shalter.deb"
    exit 1
  fi
  rm -rf "$DIR/usr"
  (cd "$DIR" && (dpkg-deb -x "$DIR/Shalter.deb" "$DIR" 2>/dev/null || (ar x "$DIR/Shalter.deb" && tar xf data.tar.* 2>/dev/null)))
  APP="$BIN"
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
echo "✅ Shalter установлен — ищите его в меню приложений."
echo "   Запуск: $APP"
echo "   Удалить: rm -rf \"$DIR\" \"$DATA/applications/shalter.desktop\""
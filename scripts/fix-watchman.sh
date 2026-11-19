#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.github.facebook.watchman.plist"

if [[ ! -f "$PLIST" ]]; then
  echo "No encontre el LaunchAgent de Watchman en: $PLIST"
  echo "Instala Watchman con Homebrew y vuelve a ejecutar este script:"
  echo "  brew install watchman"
  exit 1
fi

if grep -q "<key>Nice</key>" "$PLIST"; then
  /usr/bin/perl -0pi -e 's/\n\s*<key>Nice<\/key>\s*\n\s*<integer>-?\d+<\/integer>//g' "$PLIST"
  echo "Quite la clave Nice del LaunchAgent de Watchman."
fi

/bin/launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Esperando Watchman..."
sleep 2
/opt/homebrew/bin/watchman --no-pretty version
/opt/homebrew/bin/watchman --no-pretty watch-project "$PROJECT_ROOT"

echo
echo "Watchman quedo listo. Ahora puedes iniciar la app con:"
echo "  cd '$PROJECT_ROOT'"
echo "  npm run start:clear"

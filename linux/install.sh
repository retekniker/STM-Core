#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_APP="$PACKAGE_DIR/app"
VERSION_FILE="$PACKAGE_DIR/VERSION"

[[ -f "$VERSION_FILE" ]] || { echo "Error: package version is missing." >&2; exit 1; }
VERSION="$(<"$VERSION_FILE")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "Error: invalid package version: $VERSION" >&2
  exit 1
}

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}"
APPLICATIONS_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
INSTALL_ROOT="$DATA_HOME/stm-core"
APP_DIR="$INSTALL_ROOT/app"
CONFIG_DIR="$INSTALL_ROOT/config"
DATABASE_DIR="$INSTALL_ROOT/database"
ENV_FILE="$INSTALL_ROOT/.env"
SERVICE_DIR="$CONFIG_HOME/systemd/user"
SERVICE_FILE="$SERVICE_DIR/stm-core.service"
SYSTEMCTL="${STM_CORE_SYSTEMCTL:-systemctl}"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "Error: this package supports Linux x86_64 only." >&2
  exit 1
fi

if [[ ! -x "$SOURCE_APP/runtime/bin/node" || ! -f "$SOURCE_APP/src/index.js" ]]; then
  echo "Error: incomplete STM-Core package." >&2
  exit 1
fi

mkdir -p "$INSTALL_ROOT" "$CONFIG_DIR" "$DATABASE_DIR" "$SERVICE_DIR" "$BIN_HOME" "$APPLICATIONS_HOME"

if command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  "$SYSTEMCTL" --user stop stm-core.service >/dev/null 2>&1 || true
fi

STAGE_DIR="$INSTALL_ROOT/.app-${VERSION}.new"
OLD_DIR="$INSTALL_ROOT/.app.previous"
if [[ -e "$STAGE_DIR" ]]; then
  echo "Error: stale update staging directory exists: $STAGE_DIR" >&2
  exit 1
fi
mkdir -p "$STAGE_DIR"
cp -a "$SOURCE_APP/." "$STAGE_DIR/"

if [[ ! -f "$CONFIG_DIR/servers.json" ]]; then
  cp "$SOURCE_APP/config/servers.json" "$CONFIG_DIR/servers.json"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  TOKEN="$("$SOURCE_APP/runtime/bin/node" -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  {
    echo "STM_HOST=127.0.0.1"
    echo "STM_PORT=3000"
    echo "STM_ADMIN_TOKEN=$TOKEN"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

if [[ -e "$OLD_DIR" ]]; then
  echo "Error: stale update backup exists: $OLD_DIR" >&2
  exit 1
fi
if [[ -d "$APP_DIR" ]]; then
  mv "$APP_DIR" "$OLD_DIR"
fi
mv "$STAGE_DIR" "$APP_DIR"
if [[ -d "$OLD_DIR" ]]; then
  find "$OLD_DIR" -depth -delete
fi

cp "$PACKAGE_DIR/uninstall.sh" "$INSTALL_ROOT/uninstall.sh"
chmod 755 "$INSTALL_ROOT/uninstall.sh"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=STM-Core Server Telemetry Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=-$ENV_FILE
Environment=STM_CONFIG_PATH=$CONFIG_DIR/servers.json
Environment=STM_DATABASE_PATH=$DATABASE_DIR/stm.db
ExecStart=$APP_DIR/runtime/bin/node $APP_DIR/src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

cat > "$BIN_HOME/stm-core" <<EOF
#!/usr/bin/env bash
exec "$SYSTEMCTL" --user "\${1:-status}" stm-core.service
EOF
chmod 755 "$BIN_HOME/stm-core"

cat > "$APPLICATIONS_HOME/stm-core.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=STM-Core
Comment=Open the STM-Core dashboard
Exec=xdg-open http://127.0.0.1:3000
Icon=utilities-system-monitor
Terminal=false
Categories=Utility;Network;
EOF

if command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  "$SYSTEMCTL" --user daemon-reload
  "$SYSTEMCTL" --user enable --now stm-core.service
else
  echo "Warning: systemctl is unavailable; service files were installed but the service was not started." >&2
fi

echo
echo "STM-Core $VERSION installed successfully."
echo "Dashboard: http://127.0.0.1:3000"
echo "Data:      $INSTALL_ROOT"
echo "Service:   systemctl --user status stm-core.service"

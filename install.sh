#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/retekniker/STM-Core.git"
BRANCH="main"

XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"

INSTALL_DIR="$XDG_DATA_HOME/stm-core"
BIN_DIR="$HOME/.local/bin"
SYSTEMD_DIR="$XDG_CONFIG_HOME/systemd/user"
DESKTOP_DIR="$XDG_DATA_HOME/applications"

SERVICE_NAME="stm-core.service"
SERVICE_FILE="$SYSTEMD_DIR/$SERVICE_NAME"
DESKTOP_FILE="$DESKTOP_DIR/stm-core.desktop"
DASHBOARD_URL="http://127.0.0.1:3000/community/"

say() {
    printf '\n\033[1;36m==> %s\033[0m\n' "$1"
}

die() {
    printf '\n\033[1;31mBłąd: %s\033[0m\n' "$1" >&2
    exit 1
}

for command_name in git node npm systemctl curl; do
    command -v "$command_name" >/dev/null 2>&1 ||
        die "Brakuje programu: $command_name"
done

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"

if (( NODE_MAJOR < 18 )); then
    die "STM Core wymaga Node.js 18 lub nowszego."
fi

systemctl --user show-environment >/dev/null 2>&1 ||
    die "Nie działa sesja systemd użytkownika."

NODE_BIN="$(command -v node)"

mkdir -p "$BIN_DIR" "$SYSTEMD_DIR" "$DESKTOP_DIR"

say "Zatrzymywanie poprzedniej wersji"
systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true

if [[ -d "$INSTALL_DIR/.git" ]]; then
    say "Aktualizowanie STM Core"
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
elif [[ -e "$INSTALL_DIR" ]]; then
    die "Katalog $INSTALL_DIR istnieje, ale nie jest repozytorium STM Core."
else
    say "Pobieranie STM Core"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

say "Instalowanie zależności"
npm ci --omit=dev --prefix "$INSTALL_DIR"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    say "Generowanie tokenu administratora"
    TOKEN="$(
        node -e \
        "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    )"

    printf 'STM_ADMIN_TOKEN=%s\n' "$TOKEN" > "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
fi

say "Tworzenie usługi systemowej"

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=STM Core server telemetry monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart="$NODE_BIN" "$INSTALL_DIR/src/index.js"
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
SERVICE

cat > "$BIN_DIR/stm-core" <<LAUNCHER
#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="$SERVICE_NAME"
INSTALL_DIR="$INSTALL_DIR"
DASHBOARD_URL="$DASHBOARD_URL"

open_dashboard() {
    systemctl --user start "\$SERVICE_NAME"

    for _ in {1..30}; do
        if curl -fsS "\$DASHBOARD_URL" >/dev/null 2>&1; then
            if command -v xdg-open >/dev/null 2>&1; then
                nohup xdg-open "\$DASHBOARD_URL" >/dev/null 2>&1 &
            elif command -v gio >/dev/null 2>&1; then
                nohup gio open "\$DASHBOARD_URL" >/dev/null 2>&1 &
            else
                printf 'Otwórz w przeglądarce: %s\n' "\$DASHBOARD_URL"
            fi
            return 0
        fi

        sleep 1
    done

    printf 'STM Core nie odpowiedział pod adresem %s\n' "\$DASHBOARD_URL" >&2
    return 1
}

case "\${1:-open}" in
    open)
        open_dashboard
        ;;
    start)
        systemctl --user start "\$SERVICE_NAME"
        ;;
    stop)
        systemctl --user stop "\$SERVICE_NAME"
        ;;
    restart)
        systemctl --user restart "\$SERVICE_NAME"
        ;;
    status)
        systemctl --user status "\$SERVICE_NAME" --no-pager
        ;;
    logs)
        journalctl --user -u "\$SERVICE_NAME" -f
        ;;
    token)
        sed -n 's/^STM_ADMIN_TOKEN=//p' "\$INSTALL_DIR/.env"
        ;;
    uninstall)
        exec "\$INSTALL_DIR/uninstall.sh"
        ;;
    *)
        printf 'Użycie: stm-core {open|start|stop|restart|status|logs|token|uninstall}\n'
        exit 1
        ;;
esac
LAUNCHER

chmod 755 "$BIN_DIR/stm-core"

cat > "$INSTALL_DIR/uninstall.sh" <<UNINSTALLER
#!/usr/bin/env bash
set -Eeuo pipefail

INSTALL_DIR="$INSTALL_DIR"
SERVICE_FILE="$SERVICE_FILE"
DESKTOP_FILE="$DESKTOP_FILE"
LAUNCHER_FILE="$BIN_DIR/stm-core"
SERVICE_NAME="$SERVICE_NAME"

if [[ "\${1:-}" != "--yes" ]]; then
    printf 'Usunąć STM Core wraz z bazą danych? [y/N] '
    read -r answer

    case "\$answer" in
        y|Y|yes|YES)
            ;;
        *)
            printf 'Anulowano.\n'
            exit 0
            ;;
    esac
fi

systemctl --user disable --now "\$SERVICE_NAME" >/dev/null 2>&1 || true
rm -f "\$SERVICE_FILE" "\$DESKTOP_FILE" "\$LAUNCHER_FILE"
systemctl --user daemon-reload
rm -rf "\$INSTALL_DIR"

printf 'STM Core został odinstalowany.\n'
UNINSTALLER

chmod 755 "$INSTALL_DIR/uninstall.sh"

say "Dodawanie STM Core do menu aplikacji"

cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=STM Core
Comment=Arma 3 server telemetry dashboard
Exec="$BIN_DIR/stm-core" open
Icon=utilities-system-monitor
Terminal=false
Categories=Network;Utility;
StartupNotify=true
DESKTOP

chmod 644 "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

say "Uruchamianie STM Core"
systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

printf '\n\033[1;32mSTM Core został zainstalowany.\033[0m\n'
printf 'Panel: %s\n' "$DASHBOARD_URL"
printf 'Polecenie: %s/stm-core\n' "$BIN_DIR"
printf 'Status: systemctl --user status %s\n\n' "$SERVICE_NAME"

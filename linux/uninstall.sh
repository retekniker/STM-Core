#!/usr/bin/env bash
set -Eeuo pipefail

PURGE=0
ASSUME_YES=0
for argument in "$@"; do
  case "$argument" in
    --purge) PURGE=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "Usage: $0 [--purge] [--yes]" >&2; exit 2 ;;
  esac
done

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}"
APPLICATIONS_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
INSTALL_ROOT="$DATA_HOME/stm-core"
SERVICE_FILE="$CONFIG_HOME/systemd/user/stm-core.service"
SYSTEMCTL="${STM_CORE_SYSTEMCTL:-systemctl}"

if [[ "$INSTALL_ROOT" == "/" || "$INSTALL_ROOT" != "$DATA_HOME/stm-core" ]]; then
  echo "Error: unsafe install path: $INSTALL_ROOT" >&2
  exit 1
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  if [[ "$PURGE" -eq 1 ]]; then
    read -r -p "Remove STM-Core and permanently delete its configuration and database? [y/N] " answer
  else
    read -r -p "Remove STM-Core but keep its configuration and database? [y/N] " answer
  fi
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }
fi

if command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  "$SYSTEMCTL" --user disable --now stm-core.service >/dev/null 2>&1 || true
fi

for target in "$SERVICE_FILE" "$BIN_HOME/stm-core" "$APPLICATIONS_HOME/stm-core.desktop"; do
  if [[ -f "$target" || -L "$target" ]]; then
    unlink "$target"
  fi
done

if [[ "$PURGE" -eq 1 ]]; then
  if [[ -d "$INSTALL_ROOT" ]]; then
    find "$INSTALL_ROOT" -depth -delete
  fi
  echo "STM-Core removed; STM-Core configuration and database purged."
else
  for target in "$INSTALL_ROOT/app" "$INSTALL_ROOT/.app.previous"; do
    if [[ -d "$target" ]]; then
      find "$target" -depth -delete
    fi
  done
  if [[ -f "$INSTALL_ROOT/uninstall.sh" && "$INSTALL_ROOT/uninstall.sh" != "${BASH_SOURCE[0]}" ]]; then
    unlink "$INSTALL_ROOT/uninstall.sh"
  fi
  echo "STM-Core removed. Configuration and database preserved in: $INSTALL_ROOT"
fi

if command -v "$SYSTEMCTL" >/dev/null 2>&1; then
  "$SYSTEMCTL" --user daemon-reload >/dev/null 2>&1 || true
fi

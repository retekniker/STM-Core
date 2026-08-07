#!/usr/bin/env bash
set -Eeuo pipefail

ARCHIVE="${1:-}"
[[ -f "$ARCHIVE" ]] || { echo "Usage: tools/testLinuxRelease.sh archive.tar.gz" >&2; exit 2; }

ARCHIVE="$(cd -- "$(dirname -- "$ARCHIVE")" && pwd -P)/$(basename "$ARCHIVE")"
OUTPUT_DIR="$(dirname "$ARCHIVE")"
ARCHIVE_NAME="$(basename "$ARCHIVE")"
PACKAGE_ROOT="${ARCHIVE_NAME%.tar.gz}"
CHECKSUM="$ARCHIVE.sha256"
TEMP_DIR="$(mktemp -d)"
cleanup() { find "$TEMP_DIR" -depth -delete 2>/dev/null || true; }
trap cleanup EXIT

[[ "$PACKAGE_ROOT" =~ ^STM-Core-[0-9]+\.[0-9]+\.[0-9]+-linux-x64$ ]] || {
  echo "Error: unexpected archive name: $ARCHIVE_NAME" >&2
  exit 1
}
[[ -f "$CHECKSUM" ]] || { echo "Error: missing checksum: $CHECKSUM" >&2; exit 1; }

(
  cd "$OUTPUT_DIR"
  sha256sum --check --strict "$(basename "$CHECKSUM")"
)

while IFS= read -r member; do
  [[ "$member" != /* && "$member" != *'/../'* && "$member" != ../* ]] || {
    echo "Error: unsafe archive member: $member" >&2
    exit 1
  }
  [[ "$member" == "$PACKAGE_ROOT" || "$member" == "$PACKAGE_ROOT/"* ]] || {
    echo "Error: archive member outside package root: $member" >&2
    exit 1
  }
done < <(LC_ALL=C TAR_OPTIONS= tar -tzf "$ARCHIVE")

LC_ALL=C TAR_OPTIONS= tar -xzf "$ARCHIVE" -C "$TEMP_DIR"
PACKAGE_DIR="$TEMP_DIR/$PACKAGE_ROOT"
for required in install.sh uninstall.sh VERSION app/runtime/bin/node app/src/index.js app/config/servers.json; do
  [[ -e "$PACKAGE_DIR/$required" ]] || { echo "Error: package is missing $required" >&2; exit 1; }
done
[[ -x "$PACKAGE_DIR/install.sh" && -x "$PACKAGE_DIR/app/runtime/bin/node" ]] || {
  echo "Error: package executables lack execute permission" >&2
  exit 1
}

MOCK_BIN="$TEMP_DIR/mock-bin"
mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STM_SYSTEMCTL_LOG"
EOF
cat > "$MOCK_BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
output=""
url=""
while (($#)); do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
[[ -n "$output" && -n "$url" ]]
cp "$STM_RELEASE_FIXTURES/${url##*/}" "$output"
EOF
chmod 755 "$MOCK_BIN/systemctl"
chmod 755 "$MOCK_BIN/curl"

export HOME="$TEMP_DIR/home"
export XDG_DATA_HOME="$HOME/data"
export XDG_CONFIG_HOME="$HOME/config"
export XDG_BIN_HOME="$HOME/bin"
export STM_CORE_SYSTEMCTL="$MOCK_BIN/systemctl"
export STM_SYSTEMCTL_LOG="$TEMP_DIR/systemctl.log"
export STM_RELEASE_FIXTURES="$OUTPUT_DIR"
export PATH="$MOCK_BIN:$PATH"
mkdir -p "$HOME"

VERSION="$(<"$PACKAGE_DIR/VERSION")"
"$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)/install.sh" --version "v$VERSION"
INSTALL_ROOT="$XDG_DATA_HOME/stm-core"
[[ -x "$INSTALL_ROOT/app/runtime/bin/node" ]]
[[ -f "$INSTALL_ROOT/app/src/index.js" ]]
[[ -f "$INSTALL_ROOT/config/servers.json" ]]
[[ -f "$INSTALL_ROOT/.env" ]]
[[ "$(stat -c '%a' "$INSTALL_ROOT/.env")" == "600" ]]
[[ -x "$XDG_BIN_HOME/stm-core" ]]
[[ -f "$XDG_CONFIG_HOME/systemd/user/stm-core.service" ]]
grep -Fx -- '--user enable --now stm-core.service' "$STM_SYSTEMCTL_LOG"
"$INSTALL_ROOT/app/runtime/bin/node" --check "$INSTALL_ROOT/app/src/index.js"

echo "Linux release archive validation and installation smoke test passed."

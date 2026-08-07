#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TAG="${1:-}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/linux}"
NODE_VERSION="${NODE_VERSION:-20.17.0}"

[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "Usage: tools/buildLinuxRelease.sh vX.Y.Z [output-directory]" >&2
  exit 2
}

VERSION="${TAG#v}"
PACKAGE_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
[[ "$VERSION" == "$PACKAGE_VERSION" ]] || {
  echo "Error: tag $TAG does not match package.json version $PACKAGE_VERSION" >&2
  exit 1
}

PACKAGE_ROOT="STM-Core-${VERSION}-linux-x64"
BUILD_DIR="$OUTPUT_DIR/build"
PACKAGE_DIR="$BUILD_DIR/$PACKAGE_ROOT"
APP_DIR="$PACKAGE_DIR/app"
ARCHIVE="$OUTPUT_DIR/$PACKAGE_ROOT.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
RUNTIME_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
RUNTIME_URL="https://nodejs.org/dist/v${NODE_VERSION}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$APP_DIR/runtime" "$OUTPUT_DIR/downloads"

cp -a "$ROOT_DIR/src" "$ROOT_DIR/dashboard" "$ROOT_DIR/config" "$APP_DIR/"
cp -a "$ROOT_DIR/node_modules" "$APP_DIR/"
cp "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json" "$ROOT_DIR/README.md" \
  "$ROOT_DIR/CHANGELOG.md" "$ROOT_DIR/.env.example" "$ROOT_DIR/probe.js" "$APP_DIR/"
cp "$ROOT_DIR/linux/install.sh" "$ROOT_DIR/linux/uninstall.sh" "$ROOT_DIR/linux/README-LINUX.md" "$PACKAGE_DIR/"
printf '%s\n' "$VERSION" > "$PACKAGE_DIR/VERSION"

curl --fail --location --silent --show-error \
  --output "$OUTPUT_DIR/downloads/$RUNTIME_ARCHIVE" "$RUNTIME_URL/$RUNTIME_ARCHIVE"
curl --fail --location --silent --show-error \
  --output "$OUTPUT_DIR/downloads/SHASUMS256.txt" "$RUNTIME_URL/SHASUMS256.txt"
(
  cd "$OUTPUT_DIR/downloads"
  grep "  $RUNTIME_ARCHIVE\$" SHASUMS256.txt | sha256sum --check --strict -
)
tar -xJf "$OUTPUT_DIR/downloads/$RUNTIME_ARCHIVE" \
  --strip-components=1 -C "$APP_DIR/runtime"

chmod 755 "$PACKAGE_DIR/install.sh" "$PACKAGE_DIR/uninstall.sh" "$APP_DIR/runtime/bin/node"
"$APP_DIR/runtime/bin/node" --check "$APP_DIR/src/index.js"

cat > "$PACKAGE_DIR/BUILD-INFO.txt" <<EOF
STM-Core version: $VERSION
Source tag: $TAG
Source commit: ${GITHUB_SHA:-$(git -C "$ROOT_DIR" rev-parse HEAD)}
Architecture: x86_64
Runtime: Node.js v$NODE_VERSION linux-x64
Build time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Build environment: production node_modules created with npm ci --omit=dev
EOF

LC_ALL=C tar -czf "$ARCHIVE" -C "$BUILD_DIR" "$PACKAGE_ROOT"
(
  cd "$OUTPUT_DIR"
  sha256sum "$(basename "$ARCHIVE")" > "$(basename "$CHECKSUM")"
)

printf '%s\n' "$ARCHIVE" "$CHECKSUM"

#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="retekniker/STM-Core"
RELEASES_URL="https://github.com/$REPOSITORY/releases"

die() {
    printf 'Error: %s\n' "$1" >&2
    exit 1
}

usage() {
    printf 'Usage: install.sh [--version vX.Y.Z]\n' >&2
}

for command_name in curl find mktemp sha256sum tar; do
    command -v "$command_name" >/dev/null 2>&1 ||
        die "required command not found: $command_name"
done

case "$#" in
    0)
        latest_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "$RELEASES_URL/latest")" ||
            die "could not resolve the latest published release"
        version="${latest_url%/}"
        version="${version##*/}"
        [[ "${latest_url%/}" == "$RELEASES_URL/tag/$version" ]] ||
            die "latest release resolved outside the expected GitHub release path"
        ;;
    2)
        [[ "$1" == "--version" ]] || {
            usage
            die "unknown option: $1"
        }
        version="$2"
        ;;
    *)
        usage
        die "expected no arguments or --version vX.Y.Z"
        ;;
esac

[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
    die "release version must match vX.Y.Z"

release_number="${version#v}"
package_root="STM-Core-${release_number}-linux-x64"
archive_name="${package_root}.tar.gz"
checksum_name="${archive_name}.sha256"
download_url="$RELEASES_URL/download/$version"

temporary_directory="$(mktemp -d)" || die "could not create a temporary directory"
cleanup() {
    find "$temporary_directory" -depth -delete 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

archive_path="$temporary_directory/$archive_name"
checksum_path="$temporary_directory/$checksum_name"
normal_listing_path="$temporary_directory/archive.list"
verbose_listing_path="$temporary_directory/archive.verbose.list"

curl -fL -o "$archive_path" "$download_url/$archive_name" ||
    die "could not download $archive_name"
curl -fL -o "$checksum_path" "$download_url/$checksum_name" ||
    die "could not download $checksum_name"

mapfile -t checksum_lines < "$checksum_path"
[[ "${#checksum_lines[@]}" -eq 1 ]] ||
    die "checksum file must contain exactly one entry"
checksum_line="${checksum_lines[0]}"
[[ "$checksum_line" =~ ^[[:xdigit:]]{64}[[:space:]]+\*?([^[:space:]]+)$ ]] ||
    die "checksum file has an invalid format"
[[ "${BASH_REMATCH[1]}" == "$archive_name" ]] ||
    die "checksum file does not name $archive_name exactly"

(
    cd "$temporary_directory"
    sha256sum --check --strict "$checksum_name"
) || die "SHA-256 verification failed"

validate_member_path() {
    local member="$1"
    local allow_parent="${2:-false}"
    local component
    local -a components
    local -a normalized=()

    [[ "$member" != /* ]] || return 1
    IFS='/' read -r -a components <<< "$member"
    for component in "${components[@]}"; do
        case "$component" in
            ''|.)
                ;;
            ..)
                [[ "$allow_parent" == "true" ]] || return 1
                ((${#normalized[@]} > 0)) || return 1
                unset 'normalized[${#normalized[@]}-1]'
                ;;
            *)
                normalized+=("$component")
                ;;
        esac
    done

    [[ "${normalized[0]:-}" == "$package_root" ]]
}

LC_ALL=C TAR_OPTIONS= tar -tzf "$archive_path" > "$normal_listing_path" ||
    die "could not inspect archive contents"
LC_ALL=C TAR_OPTIONS= tar -tvzf "$archive_path" > "$verbose_listing_path" ||
    die "could not inspect archive entry types"

while IFS= read -r member; do
    validate_member_path "$member" ||
        die "archive contains an unsafe or unexpected path: $member"
done < "$normal_listing_path"

while IFS= read -r verbose_entry; do
    read -r mode owner size date time entry_details <<< "$verbose_entry"
    case "${mode:0:1}" in
        -|d)
            ;;
        l)
            [[ "$entry_details" == *" -> "* ]] || die "could not inspect archive link"
            member="${entry_details% -> *}"
            target="${entry_details##* -> }"
            [[ "$target" != /* ]] || die "archive link escapes the package root: $member"
            validate_member_path "${member%/*}/$target" true ||
                die "archive link escapes the package root: $member"
            ;;
        h)
            [[ "$entry_details" == *" link to "* ]] || die "could not inspect archive link"
            member="${entry_details% link to *}"
            target="${entry_details##* link to }"
            validate_member_path "$target" true ||
                die "archive link escapes the package root: $member"
            ;;
        *)
            die "archive contains an unsupported entry type: ${mode:0:1}"
            ;;
    esac
done < "$verbose_listing_path"

LC_ALL=C TAR_OPTIONS= tar -xzf "$archive_path" -C "$temporary_directory" ||
    die "could not extract $archive_name"

bundled_installer="$temporary_directory/$package_root/install.sh"
bundled_node="$temporary_directory/$package_root/app/runtime/bin/node"
[[ -f "$bundled_installer" ]] || die "package is missing its top-level install.sh"
[[ -x "$bundled_installer" ]] || die "packaged install.sh is not executable"
[[ -x "$bundled_node" ]] || die "package is missing its executable bundled Node.js runtime"

"$bundled_installer"

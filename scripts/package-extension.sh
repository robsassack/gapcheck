#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$repo_root/dist"
version="$(node -p "require('$repo_root/manifest.json').version")"
archive_name="gapcheck-$version.zip"
archive_path="$output_dir/$archive_name"
checksum_path="$archive_path.sha256"
staging_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$staging_dir"
}
trap cleanup EXIT

required_commands=(node zip unzip)
for command_name in "${required_commands[@]}"; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name" >&2
    exit 1
  fi
done

package_files=(
  background.js
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
  manifest.json
  nano.js
  options.html
  options.js
  panel.css
  panel.js
  pdf-resume-import.mjs
  resume-parser.js
  sidepanel.html
  vendor/pdfjs/LICENSE
  vendor/pdfjs/pdf.mjs
  vendor/pdfjs/pdf.worker.mjs
)

for relative_path in "${package_files[@]}"; do
  source_path="$repo_root/$relative_path"
  if [[ ! -f "$source_path" ]]; then
    echo "Required package file not found: $relative_path" >&2
    exit 1
  fi

  destination_path="$staging_dir/$relative_path"
  mkdir -p "$(dirname "$destination_path")"
  cp "$source_path" "$destination_path"
done

# Normalize timestamps and omit platform-specific ZIP metadata so repeated
# packages from the same sources are stable across supported build machines.
find "$staging_dir" -exec touch -t 198001010000 {} +

mkdir -p "$output_dir"
rm -f "$archive_path" "$checksum_path"

(
  cd "$staging_dir"
  find . -type f -print \
    | sed 's#^\./##' \
    | LC_ALL=C sort \
    | zip -X -q "$archive_path" -@
)

expected_contents="$(printf '%s\n' "${package_files[@]}" | LC_ALL=C sort)"
actual_contents="$(unzip -Z1 "$archive_path" | LC_ALL=C sort)"

if [[ "$actual_contents" != "$expected_contents" ]]; then
  echo "Package validation failed: ZIP contents do not match the production allowlist." >&2
  diff <(printf '%s\n' "$expected_contents") <(printf '%s\n' "$actual_contents") >&2 || true
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$output_dir"
    sha256sum "$archive_name" > "$archive_name.sha256"
  )
elif command -v shasum >/dev/null 2>&1; then
  (
    cd "$output_dir"
    shasum -a 256 "$archive_name" > "$archive_name.sha256"
  )
else
  echo "Required SHA-256 command not found: install sha256sum or shasum." >&2
  exit 1
fi

echo "Created $archive_path"
echo "Created $checksum_path"

#!/usr/bin/env bash
# Build Helper Harry InDesign plugin as a signed .ccx for direct customer distribution.
#
# Run this on a Mac (or Windows via Git Bash / WSL) that has Adobe UXP Developer Tool
# (UDT) installed. UDT performs the signing — we can't sign on a plain Linux machine.
#
# Output: dist/helper-harry-indesign-v<VERSION>.ccx
#
# Usage: ./build-ccx.sh [--unsigned]
#   --unsigned   Skip UDT signing step; produces a renamed zip (useful for CI,
#                but the resulting file requires CC Developer Mode to install).

set -euo pipefail

cd "$(dirname "$0")"

UNSIGNED=0
for arg in "$@"; do
  case "$arg" in
    --unsigned) UNSIGNED=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# --- Read version from manifest ---
VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])" 2>/dev/null \
  || node -e "console.log(require('./manifest.json').version)" 2>/dev/null)

if [ -z "$VERSION" ]; then
  echo "ERROR: could not read version from manifest.json" >&2
  exit 1
fi

echo "Helper Harry InDesign plugin — build v$VERSION"
echo

# --- Prepare staging directory ---
STAGE=".ccx-stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# Copy plugin files (exclude dev cruft)
cp manifest.json index.html index.js "$STAGE/"
cp -R src "$STAGE/"
cp -R icons "$STAGE/"

# Sanity-check icons folder is not empty (install dialog shows blank icon if so)
if [ -z "$(ls -A icons)" ]; then
  echo "WARNING: icons/ is empty — install dialog will show no icon"
  echo "         add 24x24, 48x48, 96x96 PNGs for a polished look"
  echo
fi

mkdir -p dist

# --- Unsigned path: zip + rename to .ccx ---
UNSIGNED_PATH="dist/helper-harry-indesign-v${VERSION}-unsigned.ccx"
(cd "$STAGE" && zip -qr "../$UNSIGNED_PATH" .)
echo "wrote $UNSIGNED_PATH ($(du -h "$UNSIGNED_PATH" | cut -f1))"

if [ "$UNSIGNED" -eq 1 ]; then
  echo
  echo "Unsigned build complete. Customers need Creative Cloud Developer Mode to install."
  rm -rf "$STAGE"
  exit 0
fi

# --- Signed path: invoke UDT CLI ---
UDT_CLI=""

# Mac: UDT ships a CLI inside the app bundle
if [ -x "/Applications/Adobe UXP Developer Tool.app/Contents/MacOS/UnifiedPluginInstallerAgent" ]; then
  UDT_CLI="/Applications/Adobe UXP Developer Tool.app/Contents/MacOS/UnifiedPluginInstallerAgent"
fi
# Other install locations
for candidate in \
  "$HOME/Applications/Adobe UXP Developer Tool.app/Contents/MacOS/UnifiedPluginInstallerAgent" \
  "/c/Program Files/Adobe UXP Developer Tool/UnifiedPluginInstallerAgent.exe" \
  "/c/Program Files (x86)/Adobe UXP Developer Tool/UnifiedPluginInstallerAgent.exe"; do
  if [ -z "$UDT_CLI" ] && [ -x "$candidate" ]; then
    UDT_CLI="$candidate"
  fi
done

if [ -z "$UDT_CLI" ]; then
  echo
  echo "WARNING: UDT CLI not found. Automated signing skipped."
  echo
  echo "To produce a SIGNED .ccx:"
  echo "  1. Open Adobe UXP Developer Tool"
  echo "  2. Click 'Add Plugin' → select this folder (manifest.json)"
  echo "  3. In the plugin row, click '•••' → 'Package'"
  echo "  4. UDT writes a signed .ccx to the location you choose"
  echo "  5. Move it into dist/ and upload to the HH server"
  echo
  echo "Unsigned package at $UNSIGNED_PATH can be used with CC Developer Mode."
  rm -rf "$STAGE"
  exit 0
fi

# UDT CLI signing (exact subcommand varies by UDT version — this is the 2.x syntax)
SIGNED_PATH="dist/helper-harry-indesign-v${VERSION}.ccx"
echo "Signing via UDT CLI: $UDT_CLI"
"$UDT_CLI" --cli package --input "$STAGE" --output "$SIGNED_PATH" || {
  echo "UDT CLI signing failed — falling back to unsigned build."
  echo "Open UDT and use the Package button manually (see instructions above)."
  rm -rf "$STAGE"
  exit 1
}

echo "wrote $SIGNED_PATH ($(du -h "$SIGNED_PATH" | cut -f1))"
echo
echo "Next steps:"
echo "  1. Upload dist/helper-harry-indesign-v${VERSION}.ccx to app.helperharry.com"
echo "     → /root/print-automation-system/server/static/downloads/"
echo "  2. Update DesignerTools.jsx download link if version changed"
echo "  3. Commit + push helper-harry-indesign repo with new dist/ artefact"

rm -rf "$STAGE"

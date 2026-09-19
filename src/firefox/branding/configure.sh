#!/usr/bin/env bash
# Blueberry Branding Overlay — applies to mozilla-central checkout
# Usage: ./src/firefox/branding/configure.sh /path/to/mozilla-central

set -e
MC="${1:-../mozilla-central}"
if [ ! -d "$MC/browser" ]; then echo "mozilla-central not found at $MC"; exit 1; fi

echo "[Blueberry] Applying branding overlay to $MC"

# 1. Branding
mkdir -p "$MC/browser/branding/blueberry"
cat > "$MC/browser/branding/blueberry/configure.sh" <<'EOF'
# Blueberry branding
MOZ_APP_BASENAME="Blueberry"
MOZ_APP_VENDOR="Blueberry"
MOZ_APP_NAME="blueberry"
EOF

cat > "$MC/browser/branding/blueberry/branding.nsi" <<'EOF'
!define BRAND_FULLNAME "Blueberry"
!define BRAND_SHORTNAME "Blueberry"
EOF

# 2. Distribution policies
mkdir -p "$MC/browser/extensions"
mkdir -p "$MC/distribution"
cp src/firefox/distribution/policies.json "$MC/distribution/policies.json"

# 3. System addon — build extension XPI
echo "[Blueberry] Building extension XPI..."
npm run build:firefox:extension
cp -r dist/firefox-extension "$MC/browser/extensions/blueberry@blueberry.browser"

echo "[Blueberry] Done. Now: cd $MC && ./mach build && ./mach run"

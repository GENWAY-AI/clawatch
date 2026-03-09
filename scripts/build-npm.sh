#!/bin/bash
set -e

echo "🔨 Building ClaWatch npm package..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

# 1. Build backend
echo "  Building backend..."
cd "$ROOT/backend"
npx tsc

# 2. Build frontend (Next.js standalone)
echo "  Building frontend..."
cd "$ROOT/frontend"
NEXT_PUBLIC_USE_MOCK="" npm run build

# 3. Build CLI
echo "  Building CLI..."
cd "$ROOT/cli"
npm run build

# 4. Bundle backend into CLI
echo "  Bundling backend..."
rm -rf "$ROOT/cli/backend"
mkdir -p "$ROOT/cli/backend/dist"
mkdir -p "$ROOT/cli/backend/public"
cp -r "$ROOT/backend/dist/"* "$ROOT/cli/backend/dist/"
cp -r "$ROOT/backend/public/"* "$ROOT/cli/backend/public/"
cp "$ROOT/backend/package.json" "$ROOT/cli/backend/"

echo "  Installing backend dependencies..."
cd "$ROOT/cli/backend"
npm install --omit=dev --ignore-scripts 2>/dev/null

# 5. Bundle frontend (Next.js standalone) into CLI
echo "  Bundling frontend..."
rm -rf "$ROOT/cli/frontend"
mkdir -p "$ROOT/cli/frontend"

# Copy standalone server
cp -r "$ROOT/frontend/.next/standalone/"* "$ROOT/cli/frontend/"

# Copy static assets (required by standalone)
mkdir -p "$ROOT/cli/frontend/.next/static"
cp -r "$ROOT/frontend/.next/static/"* "$ROOT/cli/frontend/.next/static/"

# Copy public assets if they exist
if [ -d "$ROOT/frontend/public" ]; then
  mkdir -p "$ROOT/cli/frontend/public"
  cp -r "$ROOT/frontend/public/"* "$ROOT/cli/frontend/public/" 2>/dev/null || true
fi

# 6. Check sizes
echo ""
echo "  Package contents:"
du -sh "$ROOT/cli/dist" "$ROOT/cli/backend" "$ROOT/cli/frontend"
echo ""

# 7. Dry run
echo "  Running npm pack (dry run)..."
cd "$ROOT/cli"
npm pack --dry-run 2>&1 | tail -5

echo ""
echo "✅ Build complete! Run 'cd cli && npm publish --access public' to publish."

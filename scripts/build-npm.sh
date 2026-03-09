#!/bin/bash
set -e

echo "🔨 Building ClaWatch npm package..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

# 1. Build backend
echo "  Building backend..."
cd "$ROOT/backend"
npx tsc

# 2. Build CLI
echo "  Building CLI..."
cd "$ROOT/cli"
npm run build

# 3. Copy backend into CLI package
echo "  Bundling backend into CLI..."
rm -rf "$ROOT/cli/backend"
mkdir -p "$ROOT/cli/backend/dist"
mkdir -p "$ROOT/cli/backend/public"
cp -r "$ROOT/backend/dist/"* "$ROOT/cli/backend/dist/"
cp -r "$ROOT/backend/public/"* "$ROOT/cli/backend/public/"
cp "$ROOT/backend/package.json" "$ROOT/cli/backend/"

# 4. Install backend prod dependencies into the bundle
echo "  Installing backend dependencies..."
cd "$ROOT/cli/backend"
npm install --omit=dev --ignore-scripts 2>/dev/null

# 5. Check size
echo ""
echo "  Package contents:"
du -sh "$ROOT/cli/dist" "$ROOT/cli/backend"
echo ""

# 6. Dry run
echo "  Running npm pack (dry run)..."
cd "$ROOT/cli"
npm pack --dry-run 2>&1 | tail -5

echo ""
echo "✅ Build complete! Run 'cd cli && npm publish --access public' to publish."

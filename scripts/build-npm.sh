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

echo "  Installing backend dependencies (with native addons)..."
cd "$ROOT/cli/backend"
npm install --omit=dev 2>/dev/null

# 5. Bundle frontend (Next.js standalone) into CLI
echo "  Bundling frontend..."
rm -rf "$ROOT/cli/frontend"
mkdir -p "$ROOT/cli/frontend"

# Copy standalone server (includes server.js, node_modules, .next/server/)
# Use rsync to include hidden dirs like .next/
rsync -a "$ROOT/frontend/.next/standalone/" "$ROOT/cli/frontend/"

# Copy static assets INTO the existing .next dir
cp -r "$ROOT/frontend/.next/static" "$ROOT/cli/frontend/.next/"

# Copy public assets if they exist
if [ -d "$ROOT/frontend/public" ]; then
  cp -r "$ROOT/frontend/public" "$ROOT/cli/frontend/public"
fi

# Verify .next has everything
echo "  Verifying frontend bundle..."
for f in BUILD_ID server routes-manifest.json static; do
  if [ ! -e "$ROOT/cli/frontend/.next/$f" ]; then
    echo "  ⚠️  Missing .next/$f!"
  fi
done

# 6. Strip bloat from node_modules
echo "  Stripping unnecessary files..."

# Frontend: remove typescript (not needed at runtime)
rm -rf "$ROOT/cli/frontend/node_modules/typescript"
# Frontend: remove @img (sharp image processing, not needed)  
rm -rf "$ROOT/cli/frontend/node_modules/@img"

# Backend: remove lodash if not needed
# NOTE: do NOT remove es-abstract — required by node-telegram-bot-api
# Backend: strip better-sqlite3 docs (keep build + lib + source for rebuild)
rm -rf "$ROOT/cli/backend/node_modules/better-sqlite3/docs"
# Backend: remove test/example dirs
find "$ROOT/cli/backend/node_modules" -type d -name "test" -exec rm -rf {} + 2>/dev/null || true
find "$ROOT/cli/backend/node_modules" -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true
find "$ROOT/cli/backend/node_modules" -type d -name "example" -exec rm -rf {} + 2>/dev/null || true
find "$ROOT/cli/backend/node_modules" -type d -name "examples" -exec rm -rf {} + 2>/dev/null || true
# Remove markdown/changelog from all modules
find "$ROOT/cli/backend/node_modules" "$ROOT/cli/frontend/node_modules" \
  -maxdepth 3 \( -name "*.md" -o -name "CHANGELOG*" -o -name "LICENSE*" -o -name ".eslintrc*" -o -name ".npmignore" \) \
  -delete 2>/dev/null || true

# 7. Check sizes
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

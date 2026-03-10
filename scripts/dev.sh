#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

BACKEND_PORT="${BACKEND_PORT:-7050}"
FRONTEND_PORT="${FRONTEND_PORT:-7051}"

echo "🔍 ClaWatch Dev Server"
echo "   Backend:  http://localhost:$BACKEND_PORT"
echo "   Frontend: http://localhost:$FRONTEND_PORT"
echo ""

# Install deps if needed
if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd "$ROOT/backend" && npm install
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

# Trap to kill both processes on Ctrl+C
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend (tsx watch = hot reload on file changes)
echo "🚀 Starting backend (port $BACKEND_PORT)..."
cd "$ROOT/backend"
PORT=$BACKEND_PORT npm run dev &
BACKEND_PID=$!

# Start frontend (next dev = hot reload)
echo "🚀 Starting frontend (port $FRONTEND_PORT)..."
cd "$ROOT/frontend"
PORT=$FRONTEND_PORT BACKEND_URL="http://localhost:$BACKEND_PORT" npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both running. Open http://localhost:$FRONTEND_PORT"
echo "   Press Ctrl+C to stop."
echo ""

# Wait for either to exit
wait -n $BACKEND_PID $FRONTEND_PID
echo "⚠️  A process exited unexpectedly. Shutting down..."
cleanup

#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

BACKEND_PORT="${BACKEND_PORT:-7050}"
FRONTEND_PORT="${FRONTEND_PORT:-7051}"

# Kill any leftover processes on our ports
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti TCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "⚠️  Port $port in use — killing leftover processes ($pids)"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
}

kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

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

# Trap to kill processes and clean up ports on exit
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  sleep 0.5
  # Kill any remaining processes on our ports (child processes npm spawns)
  kill_port "$BACKEND_PORT"
  kill_port "$FRONTEND_PORT"
  wait 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

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

# Wait forever (cleanup runs via trap on Ctrl+C or if a child dies)
wait

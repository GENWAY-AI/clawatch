#!/bin/sh
set -e

echo "Starting ClaWatch..."

# Start backend API in background
echo "  Starting backend API on port ${BACKEND_PORT:-3001}..."
cd /app/backend
PORT=${BACKEND_PORT:-3001} node dist/index.js &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 30); do
  if wget -q --spider "http://localhost:${BACKEND_PORT:-3001}/api/version" 2>/dev/null; then
    echo "  Backend API ready"
    break
  fi
  sleep 0.5
done

# Start Next.js frontend (serves on $PORT, proxies /api to backend via rewrites)
echo "  Starting dashboard on port ${PORT:-3000}..."
cd /app/frontend
HOSTNAME=0.0.0.0 PORT=${PORT:-3000} NODE_ENV=production node server.js &
FRONTEND_PID=$!

echo "✓ ClaWatch is running!"
echo "  Dashboard: http://localhost:${PORT:-3000}"
echo "  API:       http://localhost:${BACKEND_PORT:-3001}/api/agents"

# Wait for either process to exit
wait -n $BACKEND_PID $FRONTEND_PID
EXIT_CODE=$?

# If one dies, kill the other
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
exit $EXIT_CODE

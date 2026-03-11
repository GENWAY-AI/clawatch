# ClaWatch — Multi-stage Docker build for Railway deployment
# Runs both backend API and Next.js frontend in a single container

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- Backend build ----
FROM base AS backend-deps
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

FROM backend-deps AS backend-build
COPY backend/ ./backend/
RUN cd backend && npm run build

# ---- Frontend build ----
FROM base AS frontend-deps
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

FROM frontend-deps AS frontend-build
COPY frontend/ ./frontend/
# Backend runs on port 3001 inside the container
ENV BACKEND_URL=http://localhost:3001
# Show demo data on deployed site (no local OpenClaw data available)
ENV NEXT_PUBLIC_USE_MOCK=true
RUN cd frontend && npm run build

# ---- Production image ----
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat tini
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV BACKEND_PORT=3001

# Backend
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/node_modules ./backend/node_modules
COPY --from=backend-build /app/backend/package.json ./backend/

# Frontend (standalone output)
COPY --from=frontend-build /app/frontend/.next/standalone ./frontend
COPY --from=frontend-build /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-build /app/frontend/public ./frontend/public

# Entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["/app/docker-entrypoint.sh"]

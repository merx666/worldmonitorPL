# =============================================================================
# World Monitor — Docker Image
# =============================================================================
# Multi-stage build:
#   builder  — installs deps, compiles TS handlers, builds Vite frontend
#   final    — nginx (static) + node (API) under supervisord
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install root dependencies (layer-cached until package.json changes)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy full source
COPY . .

# Build Vite frontend (outputs to dist/)
RUN npx tsc && npx vite build

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS final

# nginx + gettext
RUN apk add --no-cache nginx gettext && \
    mkdir -p /tmp/nginx-client-body /tmp/nginx-proxy /tmp/nginx-fastcgi \
             /tmp/nginx-uwsgi /tmp/nginx-scgi && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Built frontend static files
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config template & entrypoint
COPY docker/nginx.conf /etc/nginx/nginx.conf.template
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Ensure writable dirs for non-root
RUN chown -R appuser:appgroup /app /tmp/nginx-client-body /tmp/nginx-proxy \
    /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi \
    /var/lib/nginx /var/log/nginx

USER appuser

EXPOSE 8080

# Healthcheck via nginx index.html
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/index.html || exit 1

CMD ["/app/entrypoint.sh"]

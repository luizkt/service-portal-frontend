# syntax=docker/dockerfile:1
# ─── Build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM nginx:alpine
WORKDIR /usr/share/nginx/html

COPY --from=build /app/dist .
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh && \
    rm -f /etc/nginx/conf.d/default.conf

# ── BFF ────────────────────────────────────────────────────────────────────────
ENV BFF_URL=http://localhost:8081

# ── Servidor ───────────────────────────────────────────────────────────────────
ENV NGINX_PORT=80

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]

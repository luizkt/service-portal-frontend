# syntax=docker/dockerfile:1
# ─── Build ────────────────────────────────────────────────────────────────────
FROM node:22.23-alpine3.24 AS build
WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
# Imagem sem privilégios: roda como uid 101 (nginx), pid/temp dirs já em /tmp.
FROM nginxinc/nginx-unprivileged:1.30-alpine3.24
WORKDIR /usr/share/nginx/html

# Root só durante o build: o entrypoint (uid 101) grava conf.d/default.conf e
# snippets/security-headers.conf na partida, então esses diretórios precisam ser do nginx.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf && \
    mkdir -p /etc/nginx/snippets /etc/nginx/templates && \
    chown -R 101:101 /etc/nginx/conf.d /etc/nginx/snippets

COPY --from=build --chown=101:101 /app/dist .
COPY --chown=101:101 nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chown=101:101 nginx/security-headers.conf.template /etc/nginx/templates/security-headers.conf.template
COPY --chown=101:101 --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

USER 101

# ── BFF ────────────────────────────────────────────────────────────────────────
ENV BFF_URL=http://localhost:8081

# ── CSP: origem do IdP (Authentik) que a SPA chama direto, em connect-src ─────
ENV CSP_CONNECT_SRC_EXTRA=http://localhost:9000

# ── Servidor ───────────────────────────────────────────────────────────────────
# 8080: usuário não-root não pode abrir portas < 1024.
ENV NGINX_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${NGINX_PORT:-8080}/ >/dev/null || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]

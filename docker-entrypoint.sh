#!/bin/sh
set -e

# Substitui apenas as variáveis do portal no template nginx.
# As variáveis nativas do nginx ($host, $uri, etc.) são preservadas.
envsubst '${BFF_URL} ${NGINX_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Cabeçalhos de segurança (CSP com origem extra do IdP em connect-src).
mkdir -p /etc/nginx/snippets
envsubst '${CSP_CONNECT_SRC_EXTRA}' \
  < /etc/nginx/templates/security-headers.conf.template \
  > /etc/nginx/snippets/security-headers.conf

exec nginx -g "daemon off;"

#!/bin/sh
set -e

# Substitui apenas as variáveis do portal no template nginx.
# As variáveis nativas do nginx ($host, $uri, etc.) são preservadas.
envsubst '${BFF_URL} ${NGINX_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"

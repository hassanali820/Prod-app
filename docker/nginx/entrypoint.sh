#!/bin/sh
# Builds the nginx config from ENABLE_SSL / DOMAIN, then starts nginx.
# With SSL: uses a temporary self-signed cert until certbot has issued the real one,
# switches automatically, and reloads every 12 h to pick up renewals.
set -e

G=/etc/nginx/gerlinx
OUT=/etc/nginx/conf.d/gerlinx.conf
INC=/etc/nginx/ssl-current.conf
LE="/etc/letsencrypt/live/${DOMAIN}"
SELF=/etc/nginx/selfsigned

update_cert_include() {
  if [ -s "$LE/fullchain.pem" ] && [ -s "$LE/privkey.pem" ]; then
    printf 'ssl_certificate %s/fullchain.pem;\nssl_certificate_key %s/privkey.pem;\n' "$LE" "$LE" > "$INC.new"
  else
    if [ ! -s "$SELF/cert.pem" ]; then
      mkdir -p "$SELF"
      if echo "$DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then SAN="IP:${DOMAIN}"; else SAN="DNS:${DOMAIN}"; fi
      openssl req -x509 -nodes -newkey rsa:2048 -days 365 -subj "/CN=${DOMAIN}" \
        -addext "subjectAltName=${SAN}" \
        -keyout "$SELF/key.pem" -out "$SELF/cert.pem" >/dev/null 2>&1
      echo "nginx: using self-signed certificate for ${DOMAIN} (until a Let's Encrypt cert exists)"
    fi
    printf 'ssl_certificate %s/cert.pem;\nssl_certificate_key %s/key.pem;\n' "$SELF" "$SELF" > "$INC.new"
  fi
  if [ -f "$INC" ] && cmp -s "$INC.new" "$INC"; then rm -f "$INC.new"; return 1; fi
  mv "$INC.new" "$INC"; return 0
}

if [ "$ENABLE_SSL" = "true" ]; then
  [ -n "$DOMAIN" ] || { echo "ENABLE_SSL=true requires DOMAIN"; exit 1; }
  update_cert_include || true
  envsubst '${DOMAIN}' < "$G/ssl.conf.template" > "$OUT"
  echo "nginx: HTTPS mode for ${DOMAIN}"
else
  cp "$G/http.conf.template" "$OUT"
  echo "nginx: HTTP mode (ENABLE_SSL=false)"
fi

nginx -t

(
  n=0
  while true; do
    sleep 60
    n=$((n + 1))
    if [ "$ENABLE_SSL" = "true" ] && update_cert_include; then
      echo "nginx: certificate changed, reloading"; nginx -s reload
    elif [ $n -ge 720 ]; then
      nginx -s reload   # every 12 h: pick up renewed certificates
      n=0
    fi
  done
) &

exec nginx -g 'daemon off;'

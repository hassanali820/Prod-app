#!/bin/sh
# Obtains the Let's Encrypt certificate for $DOMAIN (webroot) and renews it.
if [ "$ENABLE_SSL" != "true" ]; then
  echo "certbot: ENABLE_SSL is not true — idle."
  while true; do sleep 86400; done
fi

if echo "$DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "certbot: DOMAIN is an IP address ($DOMAIN). Let's Encrypt does not issue certificates for bare IPs."
  echo "certbot: nginx serves a self-signed certificate instead. Use a real domain or <ip-with-dashes>.sslip.io for a trusted one."
  while true; do sleep 86400; done
fi

EMAIL_ARG="--register-unsafely-without-email"
[ -n "$LETSENCRYPT_EMAIL" ] && EMAIL_ARG="--email $LETSENCRYPT_EMAIL --no-eff-email"
STAGING_ARG=""
[ "$LETSENCRYPT_STAGING" = "true" ] && STAGING_ARG="--staging"

sleep 10  # let nginx start

if [ ! -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  until certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
        $EMAIL_ARG $STAGING_ARG --agree-tos --non-interactive; do
    echo "certbot: request failed. Check: DNS A record of $DOMAIN -> this server, port 80 open. Retrying in 5 min."
    sleep 300
  done
  echo "certbot: certificate obtained for $DOMAIN"
fi

while true; do
  certbot renew --webroot -w /var/www/certbot --quiet
  sleep 43200
done

FROM nginx:1.27-alpine
# openssl: temporary self-signed cert until Let's Encrypt issues the real one
RUN apk add --no-cache openssl
COPY locations.conf internal.conf /etc/nginx/gerlinx/
COPY http.conf.template ssl.conf.template /etc/nginx/gerlinx/
COPY entrypoint.sh /gerlinx-entrypoint.sh
RUN chmod +x /gerlinx-entrypoint.sh && rm -f /etc/nginx/conf.d/default.conf
ENTRYPOINT ["/gerlinx-entrypoint.sh"]

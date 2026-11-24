# GerLinx Sprachtest — sprachtest.gerlinx.de

5-minute German oral proficiency test: register → pay €1.00 (Stripe) → 5 spoken questions (A1→B2, 10 s prep + 50 s recording) → Gemini grades the audio (/100, pass ≥ 70) → result shown to the candidate and emailed to the GerLinx inbox.

Everything runs from **one `docker-compose.yml`**, locally and in production.

## Stack (docker-compose.yml)

| Service  | What it is                                   | URL (local)                 |
|----------|----------------------------------------------|-----------------------------|
| nginx    | Reverse proxy, HTTPS on ports 80/443         | http://localhost:8080       |
| certbot  | Gets + renews the Let's Encrypt certificate (idle if `ENABLE_SSL=false`) | — |
| app      | Node/Express app (UI + `/api/*`)             | via nginx                   |
| db       | PostgreSQL 15                                | internal                    |
| db-init  | Applies `supabase-schema.sql` on every start (idempotent) | —              |
| auth     | Supabase Auth (GoTrue) → `/auth/v1`          | via nginx                   |
| rest     | PostgREST (Supabase REST) → `/rest/v1`       | via nginx                   |
| mailpit  | Catches all emails (admin reports)           | http://localhost:8025       |
| adminer  | Database browser                             | http://localhost:8081       |
| stripe   | Optional Stripe CLI (profile `stripe`)       | —                           |

The browser uses `supabase-js` against the same origin (`/auth/v1`, `/rest/v1`), exactly like Supabase Cloud, so the app code works with either.

## Run locally

```bash
docker compose up -d --build
```

Open **http://localhost:8080**. The provided `.env` runs in **test mode**:

- `MOCK_STRIPE=true` → a fake €1.00 checkout page, no real payment
- `MOCK_GEMINI=true` → questions from a built-in bank, score simulated from how long you spoke
- Admin report emails show up in Mailpit → http://localhost:8025
- Database: Adminer → http://localhost:8081 (System: PostgreSQL, Server: `db`, User: `postgres`, Password: `POSTGRES_PASSWORD` from `.env`)

Useful commands:

```bash
docker compose ps                 # status
docker compose logs -f app        # app logs
docker compose down               # stop
docker compose down -v            # stop AND delete the database
```

## Turning on the real services (later)

Edit `.env`, then `docker compose up -d`:

| Feature | Set in `.env` |
|---------|---------------|
| Real AI grading | `MOCK_GEMINI=false`, `GEMINI_API_KEY=…`, optionally `GEMINI_MODEL=…` |
| Real payments | `MOCK_STRIPE=false`, `STRIPE_SECRET_KEY=…`, `STRIPE_WEBHOOK_SECRET=…` |
| Gmail delivery | `GMAIL_USER=…`, `GMAIL_APP_PASSWORD=…`, `ADMIN_GMAIL=…` (overrides Mailpit) |
| Supabase Cloud instead of local DB | `SUPABASE_URL` and `SUPABASE_PUBLIC_URL` = `https://xxx.supabase.co`, its anon + service_role keys; run `supabase-schema.sql` in its SQL editor |

Stripe test webhooks locally: set `MOCK_STRIPE=false` + `sk_test_…` key, run `docker compose --profile stripe up -d`, copy the `whsec_…` from `docker compose logs stripe` into `STRIPE_WEBHOOK_SECRET`, then `docker compose up -d app`. Test card: `4242 4242 4242 4242`.

## Deploy on AWS EC2 / Contabo (Ubuntu 22.04/24.04)

1. **VM**: 2 GB RAM recommended. Open inbound ports **22, 80, 443** (EC2 Security Group / Contabo firewall).
2. **DNS**: A record `sprachtest.gerlinx.de` → VM public IP (EC2: use an Elastic IP).
3. **Docker**: `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER && newgrp docker`
4. **Copy the project** to the VM (git or `scp`, without `node_modules`).
5. **Edit `.env` for production**:
   ```
   SITE_URL=https://sprachtest.gerlinx.de
   SUPABASE_PUBLIC_URL=https://sprachtest.gerlinx.de
   ENABLE_SSL=true
   DOMAIN=sprachtest.gerlinx.de
   LETSENCRYPT_EMAIL=you@gerlinx.de
   HTTP_PORT=80
   HTTPS_PORT=443
   MOCK_STRIPE=false
   MOCK_GEMINI=false
   ```
   plus real Gemini/Stripe/Gmail keys, and **new secrets**: `node scripts/generate-keys.js` → paste `POSTGRES_PASSWORD`, `JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
6. **Start**: `docker compose up -d --build --remove-orphans`
   - Nginx starts immediately with a temporary self-signed certificate.
   - Certbot requests the real Let's Encrypt certificate (needs DNS + port 80); Nginx switches to it automatically within a minute.
   - Check: `docker compose logs certbot nginx | grep -iE "certificate|error"`
   - Debugging DNS? Set `LETSENCRYPT_STAGING=true` first (no rate limits). Afterwards set it to `false`, run `docker compose down && docker volume rm gerlinx_letsencrypt && docker compose up -d`.
   - Renewal is automatic (Certbot checks every 12 h, Nginx reloads every 12 h).
   - Nginx config lives in `docker/nginx/`; after editing run `docker compose up -d --build nginx`.
7. **Stripe live webhook**: `https://sprachtest.gerlinx.de/api/stripe-webhook` (events `checkout.session.completed`, `checkout.session.async_payment_succeeded`).
8. **Update**: `git pull && docker compose up -d --build`.

Mailpit and Adminer are bound to `127.0.0.1` only, so they are not reachable from the internet. On the VM, use an SSH tunnel: `ssh -L 8081:localhost:8081 -L 8025:localhost:8025 user@vm`.

**Backups**: `docker compose exec db pg_dump -U postgres postgres > backup-$(date +%F).sql`

## Project layout

```
docker-compose.yml           Whole stack
docker/nginx/                Nginx image: routes (locations.conf), HTTP/HTTPS templates, entrypoint
docker/certbot/certbot.sh    Let's Encrypt obtain + renew loop
Dockerfile                   App image
docker/db/roles.sql          DB roles for Auth/PostgREST (first start only)
supabase-schema.sql          Tables, RLS, grants, auto-profile trigger
scripts/generate-keys.js     Fresh DB password + JWT secret + anon/service keys
server.js                    Express server
lib/common.js                Shared helpers (auth check, clients, mail, mock flags)
netlify/functions/           API handlers (also deployable on Netlify)
  config.js                  GET  /api/config
  create-checkout.js         POST /api/create-checkout
  mock-pay.js                POST /api/mock-pay        (test mode only)
  stripe-webhook.js          POST /api/stripe-webhook
  start-exam.js              POST /api/start-exam
  evaluate-exam.js           POST /api/evaluate-exam
public/                      index.html, app.js, mock-checkout.html
```

## Security notes

- The server never trusts IDs from the browser; every API call verifies the user's access token.
- Users can only read their own rows (RLS); they cannot create attempts or mark them paid — only the server can.
- The webhook unlocks an attempt only when Stripe reports `payment_status = paid`.
- Questions are fixed once generated; each attempt can be graded only once (atomic lock, retry on failure).
- Scores are clamped and summed on the server; AI output is HTML-escaped.
- **Gemini model**: default `gemini-4-hydrogen` (from the spec). If that ID is not available on your key, change `GEMINI_MODEL`.
- **DSGVO**: registration requires consent and links to `gerlinx.de/datenschutz`. Audio is not stored; only transcripts and scores.

# GerLinx Sprachtest

5-minute German speaking test: register → pay €1 (Stripe) → 5 spoken questions (A1→B2, 10 s preparation + 50 s answer) → Gemini grades the audio (/100, pass ≥ 70) → result shown to the candidate and emailed to the admin.

## Structure

```
docker-compose.yml        3 containers: frontend, backend, db
.env                      all settings (copy from .env.example)

frontend/                 React (Vite + Tailwind), served by nginx
  nginx.conf              serves the app, forwards /api/* to the backend
  src/App.jsx             app state + which screen is shown
  src/pages/              AuthPage, Dashboard, PaymentWait, Precheck, Exam, Grading, Result,
                          ResetPassword, MockCheckout (test mode)
  src/lib/api.js          fetch wrapper (login token)
  src/lib/audio.js        microphone, German text-to-speech, recording
  src/components/ui.jsx   Card, Button, Field, Spinner

backend/                  Node.js + Express
  src/server.js           app setup + routes
  src/config.js           reads .env
  src/db.js               Postgres pool, creates tables on start (schema.sql)
  src/auth.js             JWT login tokens
  src/routes/auth.js      register, login, me, forgot/reset password
  src/routes/payments.js  Stripe checkout, webhook, mock payment
  src/routes/attempts.js  list attempts, start exam, evaluate
  src/services/ai.js      Gemini questions + grading (or mock)
  src/services/email.js   admin report + reset emails (Gmail)
```

## Run

```bash
cp .env.example .env      # then set POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d --build
```

Open **http://localhost** (port set by `APP_PORT`).

The default `.env` runs in **test mode**, without any API keys:

- `MOCK_STRIPE=true`: fake €1 checkout page
- `MOCK_GEMINI=true`: built-in questions, and a score simulated from how long you spoke
- No Gmail set: emails (admin report, reset links) are printed in `docker compose logs backend`

```bash
docker compose ps                    # status
docker compose logs -f backend       # backend logs
docker compose exec db psql -U gerlinx gerlinx   # database shell
docker compose down                  # stop (add -v to delete the database)
```

## Real services

Edit `.env`, then run `docker compose up -d`:

| Feature | Settings |
|---|---|
| AI grading | `MOCK_GEMINI=false`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Payments | `MOCK_STRIPE=false`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Webhook URL: `<site>/api/payments/webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded` |
| Email | `ADMIN_EMAIL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` |

## Server (EC2 / Contabo)

```bash
curl -fsSL https://get.docker.com | sudo sh
git clone <repo> && cd <repo>
cp .env.example .env && nano .env
docker compose up -d --build
```

Open port 80 in the firewall or Security Group. To update: `git pull && docker compose up -d --build`.

**Microphone:** browsers only allow the microphone on `https://` or `localhost`. On `http://<server-ip>` the exam cannot record. For production, put HTTPS in front of port 80 (for example a domain with a load balancer, Cloudflare, or a host-level certificate).

**Backup:** `docker compose exec db pg_dump -U gerlinx gerlinx > backup.sql`

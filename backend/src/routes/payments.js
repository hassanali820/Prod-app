const crypto = require("crypto");
const express = require("express");
const config = require("../config");
const { query } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

let stripeClient;
const stripe = () => (stripeClient ||= new (require("stripe"))(config.stripeSecretKey));

// Creates an unpaid attempt and returns the checkout URL (Stripe, or the fake page in mock mode).
router.post("/checkout", requireAuth, async (req, res) => {
  const { rows: users } = await query("select email from users where id = $1", [req.userId]);
  if (!users[0]) return res.status(401).json({ error: "Please log in again." });

  const { rows } = await query("insert into exam_attempts (user_id) values ($1) returning id", [req.userId]);
  const attemptId = rows[0].id;
  const base = config.baseUrl(req);

  if (config.mockStripe) {
    const sessionId = `mock_${crypto.randomBytes(18).toString("hex")}`;
    await query("update exam_attempts set stripe_session_id = $1 where id = $2", [sessionId, attemptId]);
    return res.json({ url: `${base}/mock-checkout?attemptId=${attemptId}&session=${sessionId}` });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: users[0].email,
    line_items: [
      {
        price_data: {
          currency: "eur",
          unit_amount: config.priceCents,
          product_data: {
            name: "GerLinx German Oral Proficiency Test (5 Min)",
            description: `AI-evaluated German speaking assessment (Pass mark: ${config.passMark}/100)`
          }
        },
        quantity: 1
      }
    ],
    metadata: { attemptId, userId: req.userId },
    client_reference_id: attemptId,
    success_url: `${base}/?payment=success&attemptId=${attemptId}`,
    cancel_url: `${base}/?payment=cancelled`
  });
  await query("update exam_attempts set stripe_session_id = $1 where id = $2", [session.id, attemptId]);
  res.json({ url: session.url });
});

// Test mode only: the fake checkout page calls this to mark the attempt as paid.
router.post("/mock-pay", requireAuth, async (req, res) => {
  if (!config.mockStripe) return res.status(404).json({ error: "Not found" });
  const { rowCount } = await query(
    "update exam_attempts set paid = true where id = $1 and user_id = $2 and stripe_session_id = $3",
    [req.body.attemptId, req.userId, req.body.session]
  );
  if (!rowCount) return res.status(400).json({ error: "Invalid payment session." });
  res.json({ redirect: `/?payment=success&attemptId=${req.body.attemptId}` });
});

// Stripe webhook: unlocks the attempt once Stripe confirms the payment.
async function webhook(req, res) {
  if (config.mockStripe) return res.status(404).end();
  let event;
  try {
    event = stripe().webhooks.constructEvent(req.body, req.headers["stripe-signature"], config.stripeWebhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    const s = event.data.object;
    if (s.payment_status === "paid" && s.metadata?.attemptId) {
      await query("update exam_attempts set paid = true where id = $1 and stripe_session_id = $2", [s.metadata.attemptId, s.id]);
    }
  }
  res.json({ received: true });
}

module.exports = { router, webhook };

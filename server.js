require("dotenv").config();
const express = require("express");
const path = require("path");

const config = require("./netlify/functions/config");
const createCheckout = require("./netlify/functions/create-checkout");
const stripeWebhook = require("./netlify/functions/stripe-webhook");
const startExam = require("./netlify/functions/start-exam");
const evaluateExam = require("./netlify/functions/evaluate-exam");
const mockPay = require("./netlify/functions/mock-pay");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

// Raw body parser required for Stripe webhook signature verification (must be before express.json)
app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const result = await stripeWebhook.handler({
    headers: req.headers,
    body: req.body.toString("utf8")
  });
  res.status(result.statusCode).send(result.body);
});

// 25 MB JSON limit for 5 base64 audio clips
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

const wrapHandler = (fn) => async (req, res) => {
  try {
    const result = await fn.handler({
      httpMethod: req.method,
      headers: req.headers,
      body: req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : ""
    });
    res.status(result.statusCode).type("application/json").send(result.body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
};

app.get("/healthz", (req, res) => res.json({ ok: true }));
app.get("/api/config", wrapHandler(config));
app.post("/api/create-checkout", wrapHandler(createCheckout));
app.post("/api/start-exam", wrapHandler(startExam));
app.post("/api/evaluate-exam", wrapHandler(evaluateExam));
app.post("/api/mock-pay", wrapHandler(mockPay)); // returns 404 unless MOCK_STRIPE=true

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`GerLinx Sprachtest running on port ${PORT}`));

// Graceful shutdown (docker stop / redeploy) — let in-flight grading requests finish.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 60000).unref();
  });
}

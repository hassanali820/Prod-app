const express = require("express");
const config = require("./config");
const { initDb } = require("./db");
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payments");
const attemptRoutes = require("./routes/attempts");

const app = express();
app.set("trust proxy", 1);

// Stripe needs the raw body to verify the signature, so this comes before express.json().
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), paymentRoutes.webhook);
app.use(express.json({ limit: "25mb" })); // 5 audio clips as base64

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/config", (req, res) =>
  res.json({ testMode: config.mockStripe || config.mockGemini, mockStripe: config.mockStripe, mockGemini: config.mockGemini })
);
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes.router);
app.use("/api/attempts", attemptRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  if (err.code === "22P02") return res.status(400).json({ error: "Invalid id." }); // bad uuid
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Server error. Please try again." });
});

initDb()
  .then(() => {
    const server = app.listen(config.port, () => {
      console.log(`Backend listening on :${config.port}`);
      console.log(`Stripe: ${config.mockStripe ? "MOCK" : "live"} | Gemini: ${config.mockGemini ? "MOCK" : config.geminiModel}`);
    });
    process.on("SIGTERM", () => server.close(() => process.exit(0)));
  })
  .catch((err) => {
    console.error("Could not initialise database:", err);
    process.exit(1);
  });

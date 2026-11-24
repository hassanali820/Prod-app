const isTrue = (v) => /^(1|true|yes)$/i.test(String(v || "").trim());

const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  siteUrl: (process.env.SITE_URL || "").replace(/\/$/, ""),

  passMark: 70,
  priceCents: 100, // €1.00

  mockStripe: isTrue(process.env.MOCK_STRIPE),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  mockGemini: isTrue(process.env.MOCK_GEMINI),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || "gemini-4-hydrogen",

  adminEmail: process.env.ADMIN_EMAIL,
  gmailUser: process.env.GMAIL_USER,
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD
};

if (!config.databaseUrl) throw new Error("DATABASE_URL is not set");
if (!config.jwtSecret) throw new Error("JWT_SECRET is not set");

// Public URL of the site, used in Stripe redirects and email links.
config.baseUrl = (req) => config.siteUrl || req.headers.origin || `${req.protocol}://${req.get("host")}`;

module.exports = config;

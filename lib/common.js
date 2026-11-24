// Shared helpers for all API handlers (Netlify functions + Express adapter).
const { createClient } = require("@supabase/supabase-js");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-4-hydrogen";
const PASS_MARK = 70;

// Mock modes let the whole flow run locally without Stripe / Gemini keys.
const isTrue = (v) => /^(1|true|yes)$/i.test(String(v || "").trim());
const MOCK_STRIPE = isTrue(process.env.MOCK_STRIPE);
const MOCK_GEMINI = isTrue(process.env.MOCK_GEMINI);

// Gmail (App Password) if configured, otherwise any SMTP server (e.g. Mailpit locally).
let _mailer;
function mailer() {
  if (_mailer !== undefined) return _mailer;
  const nodemailer = require("nodemailer");
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    _mailer = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
  } else if (process.env.SMTP_HOST) {
    _mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: isTrue(process.env.SMTP_SECURE),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  } else {
    _mailer = null;
  }
  return _mailer;
}
const MAIL_FROM = process.env.GMAIL_USER || process.env.MAIL_FROM || "sprachtest@gerlinx.local";

let _supabase, _stripe, _ai;

function supabaseAdmin() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Node < 22 has no native WebSocket; supabase-js needs one even if realtime is unused.
      realtime: { transport: require("ws") }
    });
  }
  return _supabase;
}

function stripeClient() {
  if (!_stripe) {
    const Stripe = require("stripe");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function geminiClient() {
  if (!_ai) {
    const { GoogleGenAI } = require("@google/genai");
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function rawBody(event) {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

function parseBody(event) {
  try {
    const raw = rawBody(event);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Verifies the Supabase access token sent by the browser. The candidate ID is
// NEVER taken from the request body — it always comes from the verified token.
async function getUser(event) {
  const headers = event.headers || {};
  const auth = headers.authorization || headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Gemini sometimes wraps JSON in ```json fences even in JSON mode.
function parseModelJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(cleaned);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  GEMINI_MODEL,
  PASS_MARK,
  MOCK_STRIPE,
  MOCK_GEMINI,
  mailer,
  MAIL_FROM,
  supabaseAdmin,
  stripeClient,
  geminiClient,
  json,
  rawBody,
  parseBody,
  getUser,
  parseModelJson,
  escapeHtml
};

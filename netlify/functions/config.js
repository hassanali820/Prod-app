// Public, client-safe configuration (so the anon key lives only in env vars).
const { json, MOCK_STRIPE, MOCK_GEMINI } = require("../../lib/common");

// SUPABASE_PUBLIC_URL = URL the *browser* uses (self-hosted: same origin as the site).
// SUPABASE_URL        = URL the *server* uses (self-hosted: internal docker address).
exports.handler = async () =>
  json(200, {
    supabaseUrl: process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    testMode: MOCK_STRIPE || MOCK_GEMINI
  });

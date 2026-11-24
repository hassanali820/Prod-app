// Generates fresh secrets for the self-hosted Supabase stack.
// Usage: node scripts/generate-keys.js   -> paste the output into .env
const crypto = require("crypto");

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function sign(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

const jwtSecret = crypto.randomBytes(32).toString("hex");
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600; // 10 years

console.log(`POSTGRES_PASSWORD=${crypto.randomBytes(18).toString("hex")}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`SUPABASE_ANON_KEY=${sign({ role: "anon", iss: "supabase", iat, exp }, jwtSecret)}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${sign({ role: "service_role", iss: "supabase", iat, exp }, jwtSecret)}`);

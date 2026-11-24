const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const config = require("../config");
const { query } = require("../db");
const { signToken, requireAuth } = require("../auth");
const { sendResetEmail } = require("../services/email");

const router = express.Router();

const USER_FIELDS = "id, email, full_name, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, city, mobile_number";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const clean = (v) => String(v || "").trim();

function validateRegistration(b) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return "Please enter a valid email address.";
  if (b.password.length < 6) return "Password must be at least 6 characters.";
  if (!b.full_name || !b.date_of_birth || !b.city || !b.mobile_number) {
    return "Please fill in your full name, date of birth, city, and mobile number.";
  }
  const age = (Date.now() - new Date(b.date_of_birth).getTime()) / (365.25 * 864e5);
  if (isNaN(age) || age < 14 || age > 80) return "Please enter a valid date of birth.";
  if (!/^\+?[0-9\s\-()]{7,20}$/.test(b.mobile_number)) return "Please enter a valid mobile number.";
  if (!b.consent) return "Please accept the privacy notice to continue.";
  return null;
}

router.post("/register", async (req, res) => {
  const b = {
    email: clean(req.body.email).toLowerCase(),
    password: String(req.body.password || ""),
    full_name: clean(req.body.full_name),
    date_of_birth: clean(req.body.date_of_birth),
    city: clean(req.body.city),
    mobile_number: clean(req.body.mobile_number),
    consent: req.body.consent === true
  };
  const problem = validateRegistration(b);
  if (problem) return res.status(400).json({ error: problem });

  try {
    const hash = await bcrypt.hash(b.password, 10);
    const { rows } = await query(
      `insert into users (email, password_hash, full_name, date_of_birth, city, mobile_number)
       values ($1, $2, $3, $4, $5, $6) returning ${USER_FIELDS}`,
      [b.email, hash, b.full_name, b.date_of_birth, b.city, b.mobile_number]
    );
    res.status(201).json({ token: signToken(rows[0].id), user: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "An account with this email already exists. Please log in." });
    throw err;
  }
});

router.post("/login", async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || "");
  const { rows } = await query(`select ${USER_FIELDS}, password_hash from users where email = $1`, [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Wrong email or password." });
  }
  delete user.password_hash;
  res.json({ token: signToken(user.id), user });
});

router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await query(`select ${USER_FIELDS} from users where id = $1`, [req.userId]);
  if (!rows[0]) return res.status(401).json({ error: "Please log in again." });
  res.json({ user: rows[0] });
});

// Always answers "ok" so nobody can find out which emails are registered.
router.post("/forgot-password", async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const token = crypto.randomBytes(32).toString("hex");
  const { rows } = await query(
    `update users set reset_token_hash = $1, reset_expires_at = now() + interval '1 hour'
     where email = $2 returning email`,
    [sha256(token), email]
  );
  if (rows[0]) {
    sendResetEmail(rows[0].email, `${config.baseUrl(req)}/?reset=${token}`).catch((err) =>
      console.error("Reset email failed:", err.message)
    );
  }
  res.json({ ok: true });
});

router.post("/reset-password", async (req, res) => {
  const token = clean(req.body.token);
  const password = String(req.body.password || "");
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await query(
    `update users set password_hash = $1, reset_token_hash = null, reset_expires_at = null
     where reset_token_hash = $2 and reset_expires_at > now()`,
    [hash, sha256(token)]
  );
  if (!rowCount) return res.status(400).json({ error: "This reset link is invalid or has expired." });
  res.json({ ok: true });
});

module.exports = router;

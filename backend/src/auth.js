// JWT helpers + middleware that puts the logged-in user's id on req.userId.
const jwt = require("jsonwebtoken");
const config = require("./config");

const signToken = (userId) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "7d" });

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try {
    req.userId = jwt.verify(token, config.jwtSecret).sub;
    next();
  } catch {
    res.status(401).json({ error: "Please log in again." });
  }
}

module.exports = { signToken, requireAuth };

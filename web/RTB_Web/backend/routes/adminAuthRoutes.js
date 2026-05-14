const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();

const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;

const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.set(ip, { first: Date.now(), count: 1 });
  } else {
    entry.count += 1;
  }
}

router.post("/login", async (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: "demasiados_intentos" });
  }
  const { password } = req.body || {};
  if (!password || typeof password !== "string") {
    recordAttempt(ip);
    return res.status(400).json({ error: "password_requerido" });
  }
  if (!ADMIN_HASH) {
    return res.status(500).json({ error: "admin_no_configurado" });
  }
  const ok = await bcrypt.compare(password, ADMIN_HASH);
  if (!ok) {
    recordAttempt(ip);
    return res.status(401).json({ error: "credenciales_invalidas" });
  }
  loginAttempts.delete(ip);
  req.session.admin = true;
  req.session.loginAt = Date.now();
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rtb.sid");
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  if (req.session && req.session.admin === true) {
    return res.json({ authenticated: true, loginAt: req.session.loginAt });
  }
  res.json({ authenticated: false });
});

module.exports = router;

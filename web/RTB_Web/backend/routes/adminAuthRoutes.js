const express = require("express");
const router = express.Router();
const adminStore = require("../utils/adminStore");
const { appendAudit } = require("../utils/auditLog");

// Siembra el admin raíz (desde ADMIN_PASSWORD_HASH) si aún no existe ninguno.
adminStore.ensureBootstrap();

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
  const { username, password } = req.body || {};
  if (!username || typeof username !== "string") {
    recordAttempt(ip);
    return res.status(400).json({ error: "usuario_requerido" });
  }
  if (!password || typeof password !== "string") {
    recordAttempt(ip);
    return res.status(400).json({ error: "password_requerido" });
  }

  const admin = adminStore.verify(username, password);
  if (!admin) {
    recordAttempt(ip);
    return res.status(401).json({ error: "credenciales_invalidas" });
  }

  loginAttempts.delete(ip);
  req.session.admin = true;
  req.session.user = admin.username;
  req.session.role = admin.role;
  req.session.loginAt = Date.now();
  appendAudit({ admin: admin.username, action: "login", target: admin.username });
  res.json({ ok: true, user: admin.username, role: admin.role });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rtb.sid");
    res.json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  if (req.session && req.session.admin === true) {
    return res.json({
      authenticated: true,
      user: req.session.user,
      role: req.session.role,
      loginAt: req.session.loginAt,
    });
  }
  res.json({ authenticated: false });
});

module.exports = router;

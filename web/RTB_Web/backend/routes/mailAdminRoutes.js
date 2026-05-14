const express = require("express");
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
const CONTAINER = process.env.MAILSERVER_CONTAINER || "mailserver";
const DOMAIN = process.env.MAIL_DOMAIN || "refacrtb.com.mx";

const EMAIL_RE = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const QUOTA_RE = /^(\d+)([KMG]?)$/i;
const PWD_MIN = 8;
const PWD_MAX = 128;

const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "mailbox-state.json");

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { suspended: Array.isArray(parsed.suspended) ? parsed.suspended : [] };
  } catch (err) {
    return { suspended: [] };
  }
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function setSuspended(email, suspended) {
  const state = readState();
  const set = new Set(state.suspended);
  if (suspended) set.add(email); else set.delete(email);
  state.suspended = Array.from(set).sort();
  writeState(state);
}

function generateRandomPassword(len = 32) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_";
  return Array.from(crypto.randomBytes(len)).map(b => chars[b % chars.length]).join("");
}

function runDocker(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile("docker", args, { timeout: opts.timeout || 15000 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function validateEmail(email) {
  if (!email || typeof email !== "string") return "email_requerido";
  if (email.length > 254) return "email_demasiado_largo";
  if (!EMAIL_RE.test(email)) return "email_invalido";
  return null;
}

function validatePassword(pwd) {
  if (!pwd || typeof pwd !== "string") return "password_requerido";
  if (pwd.length < PWD_MIN) return "password_corto";
  if (pwd.length > PWD_MAX) return "password_largo";
  if (/[\x00-\x1f\x7f]/.test(pwd)) return "password_caracteres_invalidos";
  return null;
}

function validateQuota(quota) {
  if (quota === null || quota === undefined || quota === "" || quota === "0") return null;
  if (typeof quota !== "string") return "cuota_invalida";
  if (!QUOTA_RE.test(quota.trim())) return "cuota_invalida";
  return null;
}

function parseAccounts(stdout) {
  const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean);
  const accounts = [];
  for (const line of lines) {
    // Cuentas recien creadas pueden venir como "* foo@bar (  /  ) [%]" porque dovecot
    // aun no las indexa. Toleramos campos vacios.
    const m = line.match(/^\*\s+(\S+)\s+\(([^/]*)\/([^)]*)\)\s*\[(\d*)%?\]/);
    if (m) {
      const usado = m[2].trim();
      const cuota = m[3].trim();
      const pct = m[4].trim();
      accounts.push({
        email: m[1],
        usado: usado || "—",
        cuota: !cuota || cuota === "~" ? "ilimitada" : cuota,
        porcentaje: pct ? parseInt(pct, 10) : 0,
      });
    }
  }
  return accounts;
}

router.get("/accounts", requireAuth, async (req, res) => {
  try {
    const { stdout } = await runDocker(["exec", CONTAINER, "setup", "email", "list"]);
    const accounts = parseAccounts(stdout);
    const suspended = new Set(readState().suspended);
    for (const a of accounts) a.suspended = suspended.has(a.email);
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: "fallo_listar", detalle: err.stderr || err.message });
  }
});

router.post("/accounts", requireAuth, async (req, res) => {
  const { email, password } = req.body || {};
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const pwdErr = validatePassword(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });

  const domain = email.split("@")[1].toLowerCase();
  if (domain !== DOMAIN.toLowerCase()) {
    return res.status(400).json({ error: "dominio_no_permitido", esperado: DOMAIN });
  }

  try {
    await runDocker(["exec", CONTAINER, "setup", "email", "add", email, password]);
    setSuspended(email, false);
    res.json({ ok: true, email });
  } catch (err) {
    const stderr = err.stderr || "";
    if (/already exists/i.test(stderr) || /exist/i.test(stderr)) {
      return res.status(409).json({ error: "cuenta_existente" });
    }
    res.status(500).json({ error: "fallo_crear", detalle: stderr || err.message });
  }
});

router.put("/accounts/:email/password", requireAuth, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { password } = req.body || {};
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const pwdErr = validatePassword(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });

  try {
    await runDocker(["exec", CONTAINER, "setup", "email", "update", email, password]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "fallo_actualizar", detalle: err.stderr || err.message });
  }
});

router.delete("/accounts/:email", requireAuth, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  try {
    await runDocker(["exec", CONTAINER, "setup", "email", "del", "-y", email]);
    setSuspended(email, false);
    return res.json({ ok: true });
  } catch (err) {
    const stderr = err.stderr || "";
    if (/Mailbox data directory.*does not exist/i.test(stderr)) {
      const [local, domain] = email.split("@");
      try {
        await runDocker(["exec", CONTAINER, "mkdir", "-p", `/var/mail/${domain}/${local}`]);
        await runDocker(["exec", CONTAINER, "setup", "email", "del", "-y", email]);
        setSuspended(email, false);
        return res.json({ ok: true });
      } catch (err2) {
        return res.status(500).json({ error: "fallo_eliminar", detalle: err2.stderr || err2.message });
      }
    }
    res.status(500).json({ error: "fallo_eliminar", detalle: stderr || err.message });
  }
});

router.post("/accounts/:email/suspend", requireAuth, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  const randomPwd = generateRandomPassword(32);
  try {
    await runDocker(["exec", CONTAINER, "setup", "email", "update", email, randomPwd]);
    setSuspended(email, true);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "fallo_suspender", detalle: err.stderr || err.message });
  }
});

router.post("/accounts/:email/unsuspend", requireAuth, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { password } = req.body || {};
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const pwdErr = validatePassword(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });

  try {
    await runDocker(["exec", CONTAINER, "setup", "email", "update", email, password]);
    setSuspended(email, false);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "fallo_reactivar", detalle: err.stderr || err.message });
  }
});

router.put("/accounts/:email/quota", requireAuth, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const { quota } = req.body || {};
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const quotaErr = validateQuota(quota);
  if (quotaErr) return res.status(400).json({ error: quotaErr });

  const normalized = (typeof quota === "string" ? quota.trim().toUpperCase() : "");

  try {
    if (!normalized || normalized === "0") {
      await runDocker(["exec", CONTAINER, "setup", "quota", "del", email]);
    } else {
      await runDocker(["exec", CONTAINER, "setup", "quota", "set", email, normalized]);
    }
    res.json({ ok: true, quota: normalized || "ilimitada" });
  } catch (err) {
    const stderr = err.stderr || "";
    if (/no quota.*set/i.test(stderr) && (!normalized || normalized === "0")) {
      return res.json({ ok: true, quota: "ilimitada" });
    }
    res.status(500).json({ error: "fallo_cuota", detalle: stderr || err.message });
  }
});

router.post("/accounts/:email/empty", requireAuth, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  try {
    await runDocker(
      ["exec", CONTAINER, "doveadm", "expunge", "-u", email, "mailbox", "*", "all"],
      { timeout: 60000 }
    );
    res.json({ ok: true });
  } catch (err) {
    const stderr = err.stderr || "";
    // doveadm devuelve codigo de salida 75 cuando no hay nada que expunge — tratamos como exito.
    if (err.code === 75 || /no messages/i.test(stderr) || /No matching messages/i.test(stderr)) {
      return res.json({ ok: true, vacio: true });
    }
    res.status(500).json({ error: "fallo_vaciar", detalle: stderr || err.message });
  }
});

module.exports = router;

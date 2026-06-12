const express = require("express");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/requireAuth");
const {
  CONTAINER,
  DOMAIN,
  DATA_DIR,
  runDocker,
  sendError,
  generateRandomPassword,
  validateEmail,
  validatePassword,
  validateQuota,
  parseAccounts,
} = require("../utils/mailExec");
const { appendAudit } = require("../utils/auditLog");

const router = express.Router();

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

router.get("/accounts", requireAuth, async (req, res) => {
  try {
    const { stdout } = await runDocker(["exec", CONTAINER, "setup", "email", "list"]);
    const accounts = parseAccounts(stdout);
    const suspended = new Set(readState().suspended);
    for (const a of accounts) a.suspended = suspended.has(a.email);
    res.json({ accounts });
  } catch (err) {
    sendError(res, 500, "fallo_listar", err);
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
    appendAudit({ admin: req.session.user, action: "create_mailbox", target: email });
    res.json({ ok: true, email });
  } catch (err) {
    const stderr = err.stderr || "";
    if (/already exists/i.test(stderr) || /exist/i.test(stderr)) {
      return res.status(409).json({ error: "cuenta_existente" });
    }
    sendError(res, 500, "fallo_crear", err);
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
    appendAudit({ admin: req.session.user, action: "change_password", target: email });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, 500, "fallo_actualizar", err);
  }
});

router.delete("/accounts/:email", requireAuth, async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });

  try {
    await runDocker(["exec", CONTAINER, "setup", "email", "del", "-y", email]);
    setSuspended(email, false);
    appendAudit({ admin: req.session.user, action: "delete_mailbox", target: email });
    return res.json({ ok: true });
  } catch (err) {
    const stderr = err.stderr || "";
    if (/Mailbox data directory.*does not exist/i.test(stderr)) {
      const [local, domain] = email.split("@");
      try {
        await runDocker(["exec", CONTAINER, "mkdir", "-p", `/var/mail/${domain}/${local}`]);
        await runDocker(["exec", CONTAINER, "setup", "email", "del", "-y", email]);
        setSuspended(email, false);
        appendAudit({ admin: req.session.user, action: "delete_mailbox", target: email });
        return res.json({ ok: true });
      } catch (err2) {
        return sendError(res, 500, "fallo_eliminar", err2);
      }
    }
    sendError(res, 500, "fallo_eliminar", err);
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
    appendAudit({ admin: req.session.user, action: "suspend", target: email });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, 500, "fallo_suspender", err);
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
    appendAudit({ admin: req.session.user, action: "unsuspend", target: email });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, 500, "fallo_reactivar", err);
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
    appendAudit({ admin: req.session.user, action: "set_quota", target: email, details: `quota=${normalized || "ilimitada"}` });
    res.json({ ok: true, quota: normalized || "ilimitada" });
  } catch (err) {
    const stderr = err.stderr || "";
    if (/no quota.*set/i.test(stderr) && (!normalized || normalized === "0")) {
      appendAudit({ admin: req.session.user, action: "set_quota", target: email, details: "quota=ilimitada" });
      return res.json({ ok: true, quota: "ilimitada" });
    }
    sendError(res, 500, "fallo_cuota", err);
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
    appendAudit({ admin: req.session.user, action: "empty_mailbox", target: email });
    res.json({ ok: true });
  } catch (err) {
    const stderr = err.stderr || "";
    // doveadm devuelve codigo de salida 75 cuando no hay nada que expunge — tratamos como exito.
    if (err.code === 75 || /no messages/i.test(stderr) || /No matching messages/i.test(stderr)) {
      appendAudit({ admin: req.session.user, action: "empty_mailbox", target: email });
      return res.json({ ok: true, vacio: true });
    }
    sendError(res, 500, "fallo_vaciar", err);
  }
});

module.exports = router;

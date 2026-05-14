const express = require("express");
const { execFile } = require("child_process");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
const CONTAINER = process.env.MAILSERVER_CONTAINER || "mailserver";
const DOMAIN = process.env.MAIL_DOMAIN || "refacrtb.com.mx";

const EMAIL_RE = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const PWD_MIN = 8;
const PWD_MAX = 128;

function runDocker(args) {
  return new Promise((resolve, reject) => {
    execFile("docker", args, { timeout: 15000 }, (err, stdout, stderr) => {
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

function parseAccounts(stdout) {
  const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean);
  const accounts = [];
  for (const line of lines) {
    const m = line.match(/^\*\s+(\S+)\s+\(\s*([^/]+?)\s*\/\s*([^)]+?)\s*\)\s*\[(\d+)%\]/);
    if (m) {
      accounts.push({
        email: m[1],
        usado: m[2],
        cuota: m[3] === "~" ? "ilimitada" : m[3],
        porcentaje: parseInt(m[4], 10),
      });
    }
  }
  return accounts;
}

router.get("/accounts", requireAuth, async (req, res) => {
  try {
    const { stdout } = await runDocker(["exec", CONTAINER, "setup", "email", "list"]);
    res.json({ accounts: parseAccounts(stdout) });
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
    return res.json({ ok: true });
  } catch (err) {
    const stderr = err.stderr || "";
    // docker-mailserver aborta si la cuenta no tiene maildir aun (cuenta recien creada
    // sin recibir correo). Pre-creamos el dir y reintentamos una vez.
    if (/Mailbox data directory.*does not exist/i.test(stderr)) {
      const [local, domain] = email.split("@");
      try {
        await runDocker(["exec", CONTAINER, "mkdir", "-p", `/var/mail/${domain}/${local}`]);
        await runDocker(["exec", CONTAINER, "setup", "email", "del", "-y", email]);
        return res.json({ ok: true });
      } catch (err2) {
        return res.status(500).json({ error: "fallo_eliminar", detalle: err2.stderr || err2.message });
      }
    }
    res.status(500).json({ error: "fallo_eliminar", detalle: stderr || err.message });
  }
});

module.exports = router;

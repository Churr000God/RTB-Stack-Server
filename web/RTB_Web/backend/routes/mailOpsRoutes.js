// Endpoints de operación/monitoreo del correo: KPIs, almacenamiento por dominio,
// auditoría, info de conexión, verificación DNS, estado/logs del contenedor y
// respaldos en streaming (tar.gz). Todos protegidos con requireAuth.
const express = require("express");
const { spawn } = require("child_process");
const dns = require("dns").promises;
const requireAuth = require("../middleware/requireAuth");
const {
  CONTAINER,
  DOMAIN,
  runDocker,
  validateEmail,
  validateDomain,
  parseAccounts,
  sizeToBytes,
  bytesToHuman,
} = require("../utils/mailExec");
const { readAudit, appendAudit } = require("../utils/auditLog");

const router = express.Router();

// Configuración de conexión (con defaults; sobreescribible por env).
const MAIL_HOST = process.env.MAIL_PUBLIC_HOST || `mail.${DOMAIN}`;
const WEBMAIL_URL = process.env.WEBMAIL_URL || `https://mail.${DOMAIN}`;
const SERVER_IP = process.env.MAIL_SERVER_IP || "217.154.101.174";
const DKIM_SELECTOR = process.env.DKIM_SELECTOR || "mail";

const STATE_FILE = require("path").join(require("../utils/mailExec").DATA_DIR, "mailbox-state.json");
function readSuspended() {
  try {
    const parsed = JSON.parse(require("fs").readFileSync(STATE_FILE, "utf8"));
    return new Set(Array.isArray(parsed.suspended) ? parsed.suspended : []);
  } catch (_) {
    return new Set();
  }
}

async function listAccounts() {
  const { stdout } = await runDocker(["exec", CONTAINER, "setup", "email", "list"]);
  const accounts = parseAccounts(stdout);
  const suspended = readSuspended();
  for (const a of accounts) a.suspended = suspended.has(a.email);
  return accounts;
}

async function containerState() {
  try {
    const { stdout } = await runDocker([
      "inspect", "-f", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}", CONTAINER,
    ]);
    const [status, rawHealth] = stdout.trim().split("|");
    // Si Docker no tiene healthcheck definido, derivamos la salud del estado del contenedor.
    let health;
    if (!rawHealth || rawHealth === "n/a") {
      if (status === "running")               health = "saludable";
      else if (status === "exited" || status === "dead") health = "caído";
      else                                    health = "desconocido";
    } else {
      health = rawHealth;
    }
    return { status: status || "desconocido", health };
  } catch (err) {
    return { status: "no_encontrado", health: "caído", error: err.stderr || err.message };
  }
}

// Agrupa cuentas por dominio con disco sumado.
function groupByDomain(accounts) {
  const map = new Map();
  for (const a of accounts) {
    const dom = (a.email.split("@")[1] || "—").toLowerCase();
    if (!map.has(dom)) map.set(dom, { dominio: dom, buzones: [], bytes: 0 });
    const g = map.get(dom);
    g.buzones.push(a);
    g.bytes += sizeToBytes(a.usado);
  }
  return Array.from(map.values())
    .map(g => ({ dominio: g.dominio, buzones: g.buzones, disco: bytesToHuman(g.bytes), bytes: g.bytes }))
    .sort((a, b) => a.dominio.localeCompare(b.dominio));
}

// ──────────── Dashboard / KPIs ────────────
router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const accounts = await listAccounts();
    const suspendidos = accounts.filter(a => a.suspended).length;
    const totalBytes = accounts.reduce((s, a) => s + sizeToBytes(a.usado), 0);
    const dominios = groupByDomain(accounts).map(g => ({ dominio: g.dominio, buzones: g.buzones.length, disco: g.disco }));
    const contenedor = await containerState();
    res.json({
      total: accounts.length,
      activos: accounts.length - suspendidos,
      suspendidos,
      almacenamientoTotal: bytesToHuman(totalBytes),
      dominios,
      contenedor,
    });
  } catch (err) {
    res.status(500).json({ error: "fallo_dashboard", detalle: err.stderr || err.message });
  }
});

// ──────────── Almacenamiento por dominio ────────────
router.get("/storage", requireAuth, async (req, res) => {
  try {
    const accounts = await listAccounts();
    res.json({ dominios: groupByDomain(accounts) });
  } catch (err) {
    res.status(500).json({ error: "fallo_storage", detalle: err.stderr || err.message });
  }
});

// ──────────── Auditoría ────────────
router.get("/audit", requireAuth, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  res.json({ entries: readAudit(limit) });
});

// ──────────── Info de conexión (para guía/instructivo) ────────────
router.get("/connection-info", requireAuth, (req, res) => {
  res.json({
    host: MAIL_HOST,
    webmail: WEBMAIL_URL,
    imap: { servidor: MAIL_HOST, puerto: 993, cifrado: "SSL / TLS" },
    smtp: { servidor: MAIL_HOST, puerto: 587, cifrado: "STARTTLS" },
    pop3: { servidor: MAIL_HOST, puerto: 995, cifrado: "SSL / TLS" },
  });
});

// ──────────── Verificación DNS ────────────
async function txtJoined(name) {
  const records = await dns.resolveTxt(name); // array de arrays de strings
  return records.map(parts => parts.join("")).filter(Boolean);
}

router.get("/dns", requireAuth, async (req, res) => {
  const domain = (req.query.domain || DOMAIN).toLowerCase();
  const domErr = validateDomain(domain);
  if (domErr) return res.status(400).json({ error: domErr });

  const checks = [];

  // MX
  try {
    const mx = await dns.resolveMx(domain);
    const list = mx.map(m => `${m.exchange} (prio ${m.priority})`).sort();
    const apunta = mx.some(m => m.exchange.toLowerCase().includes(MAIL_HOST.toLowerCase()) || m.exchange.toLowerCase().includes(domain));
    checks.push({ tipo: "MX", esperado: `${MAIL_HOST}`, encontrado: list.join(", ") || "—", estado: list.length ? (apunta ? "ok" : "warn") : "fail" });
  } catch (e) {
    checks.push({ tipo: "MX", esperado: MAIL_HOST, encontrado: "sin registro", estado: "fail" });
  }

  // A de mail.<dominio>
  try {
    const a = await dns.resolve4(MAIL_HOST);
    const ok = a.includes(SERVER_IP);
    checks.push({ tipo: "A (mail)", esperado: SERVER_IP, encontrado: a.join(", ") || "—", estado: a.length ? (ok ? "ok" : "warn") : "fail" });
  } catch (e) {
    checks.push({ tipo: "A (mail)", esperado: SERVER_IP, encontrado: "sin registro", estado: "fail" });
  }

  // SPF (TXT del dominio)
  try {
    const txts = await txtJoined(domain);
    const spf = txts.find(t => /v=spf1/i.test(t));
    checks.push({ tipo: "SPF", esperado: "v=spf1 … -all", encontrado: spf || "sin registro", estado: spf ? "ok" : "fail" });
  } catch (e) {
    checks.push({ tipo: "SPF", esperado: "v=spf1 … -all", encontrado: "sin registro", estado: "fail" });
  }

  // DKIM (selector configurable)
  const dkimName = `${DKIM_SELECTOR}._domainkey.${domain}`;
  try {
    const txts = await txtJoined(dkimName);
    const dkim = txts.find(t => /v=DKIM1|p=/i.test(t));
    checks.push({ tipo: `DKIM (${DKIM_SELECTOR})`, esperado: "v=DKIM1; k=rsa; p=…", encontrado: dkim ? dkim.slice(0, 60) + "…" : "sin registro", estado: dkim ? "ok" : "warn" });
  } catch (e) {
    checks.push({ tipo: `DKIM (${DKIM_SELECTOR})`, esperado: "v=DKIM1; k=rsa; p=…", encontrado: "sin registro — genera con: setup config dkim", estado: "warn" });
  }

  // DMARC
  try {
    const txts = await txtJoined(`_dmarc.${domain}`);
    const dmarc = txts.find(t => /v=DMARC1/i.test(t));
    checks.push({ tipo: "DMARC", esperado: "v=DMARC1; p=quarantine; …", encontrado: dmarc || "sin registro", estado: dmarc ? "ok" : "warn" });
  } catch (e) {
    checks.push({ tipo: "DMARC", esperado: "v=DMARC1; p=quarantine; …", encontrado: "sin registro", estado: "warn" });
  }

  res.json({ domain, checks });
});

// ──────────── Estado del contenedor ────────────
router.get("/container/status", requireAuth, async (req, res) => {
  const estado = await containerState();
  let cpu = "—", mem = "—", memPct = "—";
  try {
    const { stdout } = await runDocker(
      ["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}", CONTAINER],
      { timeout: 8000 }
    );
    const [c, m, mp] = stdout.trim().split("|");
    cpu = c || "—"; mem = m || "—"; memPct = mp || "—";
  } catch (_) { /* stats puede fallar si el contenedor está parado */ }
  res.json({ contenedor: CONTAINER, ...estado, cpu, mem, memPct });
});

// ──────────── Logs del contenedor ────────────
router.get("/container/logs", requireAuth, async (req, res) => {
  const lines = Math.min(Math.max(parseInt(req.query.lines, 10) || 200, 1), 1000);
  try {
    const { stdout, stderr } = await runDocker(
      ["logs", "--tail", String(lines), CONTAINER],
      { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }
    );
    // docker-mailserver escribe gran parte de sus logs a stderr.
    res.type("text/plain").send((stderr || "") + (stdout || "") || "(sin logs)");
  } catch (err) {
    res.status(500).json({ error: "fallo_logs", detalle: err.stderr || err.message });
  }
});

// ──────────── Control de ciclo de vida del contenedor ────────────
// Estas rutas ejecutan docker start/stop/restart sin shell (execFile).
// Requieren sesión autenticada. Acciones destructivas → confirm() en el front.

const CTL_ACTIONS = {
  start:   { args: ["start"],   label: "container_start",   timeout: 20000 },
  stop:    { args: ["stop"],    label: "container_stop",    timeout: 30000 },
  restart: { args: ["restart"], label: "container_restart", timeout: 30000 },
};

Object.entries(CTL_ACTIONS).forEach(([action, cfg]) => {
  router.post(`/container/${action}`, requireAuth, async (req, res) => {
    try {
      await runDocker([...cfg.args, CONTAINER], { timeout: cfg.timeout });
      appendAudit({ admin: req.session.user || "admin", action: cfg.label, target: CONTAINER });
      const estado = await containerState();
      res.json({ ok: true, accion: action, ...estado });
    } catch (err) {
      res.status(500).json({ error: `fallo_${action}`, detalle: err.stderr || err.message });
    }
  });
});

// ──────────── Respaldos (streaming tar.gz vía contenedor) ────────────
function streamTar(res, innerArgs, filename, audit) {
  res.setHeader("Content-Type", "application/gzip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const child = spawn("docker", ["exec", CONTAINER, "tar", "czf", "-", ...innerArgs]);
  child.stdout.pipe(res);
  let errBuf = "";
  child.stderr.on("data", d => { if (errBuf.length < 2000) errBuf += d.toString(); });
  child.on("error", (err) => {
    if (!res.headersSent) res.status(500).json({ error: "fallo_respaldo", detalle: err.message });
    else res.destroy();
  });
  child.on("close", (code) => {
    // tar devuelve 1 por "file changed as we read it" (correo entrante) — tolerable.
    if (code && code !== 1) {
      if (!res.headersSent) res.status(500).json({ error: "fallo_respaldo", detalle: errBuf.slice(0, 500) });
      else res.destroy();
    } else {
      appendAudit(audit);
    }
  });
  // Si el cliente corta la descarga, matamos el tar para no dejar procesos colgados.
  res.on("close", () => { if (!child.killed) child.kill("SIGKILL"); });
}

router.get("/backup/account/:email", requireAuth, (req, res) => {
  const email = decodeURIComponent(req.params.email);
  if (validateEmail(email)) return res.status(400).json({ error: "email_invalido" });
  const [local, domain] = email.split("@");
  const fecha = new Date().toISOString().slice(0, 10);
  streamTar(res, ["-C", "/var/mail", `${domain}/${local}`], `backup-${local}-${domain}-${fecha}.tar.gz`,
    { action: "backup_mailbox", target: email });
});

router.get("/backup/domain/:domain", requireAuth, (req, res) => {
  const domain = decodeURIComponent(req.params.domain).toLowerCase();
  if (validateDomain(domain)) return res.status(400).json({ error: "dominio_invalido" });
  const fecha = new Date().toISOString().slice(0, 10);
  streamTar(res, ["-C", "/var/mail", domain], `backup-${domain}-${fecha}.tar.gz`,
    { action: "backup_domain", target: domain });
});

router.get("/backup/all", requireAuth, (req, res) => {
  const fecha = new Date().toISOString().slice(0, 10);
  streamTar(res, ["-C", "/var/mail", "."], `backup-correo-completo-${fecha}.tar.gz`,
    { action: "backup_all", target: "todos" });
});

module.exports = router;

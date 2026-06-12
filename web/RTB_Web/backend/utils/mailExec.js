// Helpers compartidos para operar el contenedor de correo (docker-mailserver).
// Centraliza ejecución sin shell (execFile), validación de entrada y parseo de
// la salida de `setup email list`, reusado por mailAdminRoutes y mailOpsRoutes.
const { execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CONTAINER = process.env.MAILSERVER_CONTAINER || "mailserver";
const DOMAIN = process.env.MAIL_DOMAIN || "refacrtb.com.mx";

// Parte local: segmentos [a-z0-9_-] separados por puntos — sin punto inicial,
// final ni dobles (".." sería traversal al construir rutas tipo /var/mail/dom/local).
// Dominio: etiquetas que no inician/terminan en guion, separadas por puntos, TLD ≥ 2.
const EMAIL_RE = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const QUOTA_RE = /^(\d+)([KMG]?)$/i;
const PWD_MIN = 8;
const PWD_MAX = 128;

const DATA_DIR = path.join(__dirname, "..", "data");

// Responde un error al cliente SIN detalles internos (stderr de Docker, rutas).
// El detalle técnico va solo al log del backend (visible con pm2 logs).
function sendError(res, status, code, err) {
  const detalle = err ? (err.stderr || err.message || String(err)) : "";
  console.error(`[api] ${code}${detalle ? ` — ${String(detalle).trim().slice(0, 500)}` : ""}`);
  return res.status(status).json({ error: code });
}

function runDocker(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile("docker", args, { timeout: opts.timeout || 15000, maxBuffer: opts.maxBuffer || 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function generateRandomPassword(len = 32) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_";
  return Array.from(crypto.randomBytes(len)).map(b => chars[b % chars.length]).join("");
}

function validateEmail(email) {
  if (!email || typeof email !== "string") return "email_requerido";
  if (email.length > 254) return "email_demasiado_largo";
  if (!EMAIL_RE.test(email)) return "email_invalido";
  return null;
}

function validateDomain(domain) {
  if (!domain || typeof domain !== "string") return "dominio_requerido";
  if (domain.length > 254) return "dominio_demasiado_largo";
  if (!DOMAIN_RE.test(domain)) return "dominio_invalido";
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

// Convierte un tamaño tipo "1.8G", "33M", "940K", "0 B", "—" a bytes (best-effort).
function sizeToBytes(s) {
  if (!s || typeof s !== "string") return 0;
  const m = s.trim().match(/^([\d.]+)\s*([KMGTB]?)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return 0;
  const unit = (m[2] || "B").toUpperCase();
  const mult = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[unit] || 1;
  return Math.round(n * mult);
}

function bytesToHuman(bytes) {
  if (!bytes) return "0";
  const units = ["B", "K", "M", "G", "T"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)}${units[i]}`;
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

module.exports = {
  CONTAINER,
  DOMAIN,
  DATA_DIR,
  PWD_MIN,
  PWD_MAX,
  runDocker,
  sendError,
  generateRandomPassword,
  validateEmail,
  validateDomain,
  validatePassword,
  validateQuota,
  parseAccounts,
  sizeToBytes,
  bytesToHuman,
  fs,
  path,
};

// Registro de auditoría append-only en JSONL. Una línea por acción admin.
// Se persiste junto al estado de buzones (data/), con permisos 0600.
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const AUDIT_FILE = path.join(DATA_DIR, "audit-log.jsonl");

// Registra una acción. Nunca lanza: la auditoría no debe tumbar una operación.
function appendAudit({ admin = "admin", action, target = "", details = "" } = {}) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      admin,
      action,
      target,
      details,
    });
    fs.appendFileSync(AUDIT_FILE, entry + "\n", { mode: 0o600 });
  } catch (err) {
    console.error("audit_append_error", err.message);
  }
}

// Devuelve las últimas `limit` entradas, más reciente primero.
function readAudit(limit = 200) {
  try {
    const raw = fs.readFileSync(AUDIT_FILE, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const slice = lines.slice(-limit).reverse();
    const entries = [];
    for (const line of slice) {
      try { entries.push(JSON.parse(line)); } catch (_) { /* línea corrupta: ignorar */ }
    }
    return entries;
  } catch (err) {
    return [];
  }
}

module.exports = { appendAudit, readAudit, AUDIT_FILE };

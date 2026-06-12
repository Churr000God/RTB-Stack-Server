// Persistencia de administradores del panel en data/admins.json.
// Soporta multi-admin con roles (admin / operador). El admin raíz se siembra
// (bootstrap) desde ADMIN_PASSWORD_HASH del .env la primera vez, para no perder
// el acceso existente. Hashes bcrypt; archivo con permisos 0600.
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { DATA_DIR } = require("./mailExec");

const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const ROLES = ["admin", "operador"];
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const PWD_MIN = 8;
const PWD_MAX = 128;

function readAdmins() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
    return Array.isArray(parsed.admins) ? parsed.admins : [];
  } catch (_) {
    return [];
  }
}

function writeAdmins(admins) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ADMINS_FILE, JSON.stringify({ admins }, null, 2), { mode: 0o600 });
}

// Siembra el admin raíz si no hay ningún administrador todavía.
function ensureBootstrap() {
  const admins = readAdmins();
  if (admins.length) return;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return; // sin hash en .env no podemos sembrar; login fallará con admin_no_configurado
  const username = process.env.ADMIN_USERNAME || "admin";
  writeAdmins([{
    username,
    passwordHash: hash,
    role: "admin",
    createdAt: new Date().toISOString(),
    createdBy: "system",
  }]);
}

function validateUsername(username) {
  if (!username || typeof username !== "string") return "usuario_requerido";
  if (!USERNAME_RE.test(username)) return "usuario_invalido"; // 3-32, alfanumérico . _ -
  return null;
}

function validatePassword(pwd) {
  if (!pwd || typeof pwd !== "string") return "password_requerido";
  if (pwd.length < PWD_MIN) return "password_corto";
  if (pwd.length > PWD_MAX) return "password_largo";
  if (/[\x00-\x1f\x7f]/.test(pwd)) return "password_caracteres_invalidos";
  return null;
}

function validateRole(role) {
  if (!ROLES.includes(role)) return "rol_invalido";
  return null;
}

function findAdmin(username) {
  const u = String(username || "").toLowerCase();
  return readAdmins().find(a => a.username.toLowerCase() === u) || null;
}

// Devuelve el admin si las credenciales son válidas, null en caso contrario.
function verify(username, password) {
  const admin = findAdmin(username);
  if (!admin) return null;
  return bcrypt.compareSync(password, admin.passwordHash) ? admin : null;
}

function createAdmin({ username, password, role, createdBy }) {
  const errs = validateUsername(username) || validatePassword(password) || validateRole(role);
  if (errs) return { error: errs };
  if (findAdmin(username)) return { error: "usuario_existente" };
  const admins = readAdmins();
  admins.push({
    username,
    passwordHash: bcrypt.hashSync(password, 12),
    role,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || "admin",
  });
  writeAdmins(admins);
  return { ok: true };
}

function setPassword(username, password) {
  const pErr = validatePassword(password);
  if (pErr) return { error: pErr };
  const admins = readAdmins();
  const admin = admins.find(a => a.username.toLowerCase() === String(username).toLowerCase());
  if (!admin) return { error: "usuario_no_encontrado" };
  admin.passwordHash = bcrypt.hashSync(password, 12);
  writeAdmins(admins);
  return { ok: true };
}

function removeAdmin(username) {
  const admins = readAdmins();
  const target = admins.find(a => a.username.toLowerCase() === String(username).toLowerCase());
  if (!target) return { error: "usuario_no_encontrado" };
  const remainingAdmins = admins.filter(a => a.role === "admin" && a.username !== target.username);
  if (target.role === "admin" && remainingAdmins.length === 0) {
    return { error: "ultimo_admin" }; // no dejar el sistema sin ningún admin
  }
  writeAdmins(admins.filter(a => a.username !== target.username));
  return { ok: true };
}

// Lista sin exponer hashes.
function listPublic() {
  return readAdmins().map(a => ({
    username: a.username,
    role: a.role,
    createdAt: a.createdAt,
    createdBy: a.createdBy,
  }));
}

module.exports = {
  ensureBootstrap,
  verify,
  findAdmin,
  createAdmin,
  setPassword,
  removeAdmin,
  listPublic,
  validateUsername,
  validatePassword,
  validateRole,
  ROLES,
};

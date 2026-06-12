// Gestión de usuarios del panel (administradores). TODO reservado al rol "admin"
// vía requireAdmin. Los operadores no pueden listar ni modificar usuarios.
const express = require("express");
const router = express.Router();
const requireAdmin = require("../middleware/requireAdmin");
const adminStore = require("../utils/adminStore");
const { appendAudit } = require("../utils/auditLog");

// Listar administradores (sin hashes).
router.get("/", requireAdmin, (req, res) => {
  res.json({ users: adminStore.listPublic() });
});

// Crear nuevo administrador/operador.
router.post("/", requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  const result = adminStore.createAdmin({ username, password, role, createdBy: req.session.user });
  if (result.error) {
    const code = result.error === "usuario_existente" ? 409 : 400;
    return res.status(code).json({ error: result.error });
  }
  appendAudit({ admin: req.session.user, action: "create_admin", target: username, details: `role=${role}` });
  res.json({ ok: true });
});

// Cambiar la contraseña de un usuario (solo admin).
router.put("/:username/password", requireAdmin, (req, res) => {
  const username = req.params.username;
  const { password } = req.body || {};
  const result = adminStore.setPassword(username, password);
  if (result.error) {
    const code = result.error === "usuario_no_encontrado" ? 404 : 400;
    return res.status(code).json({ error: result.error });
  }
  appendAudit({ admin: req.session.user, action: "change_admin_password", target: username });
  res.json({ ok: true });
});

// Eliminar un usuario (no a sí mismo, no el último admin).
router.delete("/:username", requireAdmin, (req, res) => {
  const username = req.params.username;
  if (username.toLowerCase() === String(req.session.user).toLowerCase()) {
    return res.status(400).json({ error: "no_autoeliminacion" });
  }
  const result = adminStore.removeAdmin(username);
  if (result.error) {
    const code = result.error === "usuario_no_encontrado" ? 404 : 400;
    return res.status(code).json({ error: result.error });
  }
  appendAudit({ admin: req.session.user, action: "delete_admin", target: username });
  res.json({ ok: true });
});

module.exports = router;

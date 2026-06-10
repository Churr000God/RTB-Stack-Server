// Exige sesión autenticada con rol "admin". Para acciones reservadas al
// administrador (gestión de usuarios del panel). Los operadores reciben 403.
module.exports = function requireAdmin(req, res, next) {
  if (!req.session || req.session.admin !== true) {
    return res.status(401).json({ error: "no_autenticado" });
  }
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "permiso_denegado" });
  }
  return next();
};

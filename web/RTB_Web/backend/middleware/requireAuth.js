module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.admin === true) {
    return next();
  }
  return res.status(401).json({ error: "no_autenticado" });
};

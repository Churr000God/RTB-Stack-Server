// backend/routes/contactRoutes.js
const express = require("express");
const router = express.Router();
const { handleContactForm } = require("../controllers/contactController");

// Ruta: POST /api/contacto
router.post("/contacto", handleContactForm);

module.exports = router;

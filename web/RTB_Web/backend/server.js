// backend/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const contactRoutes = require("./routes/contactRoutes");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir PDFs
app.use("/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));

// Montar rutas API
app.use("/api", contactRoutes);

// Ruta de prueba opcional
app.get("/api/status", (req, res) => {
  res.json({ message: "Servidor funcionando correctamente." });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});

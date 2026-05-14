// backend/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const contactRoutes = require("./routes/contactRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const mailAdminRoutes = require("./routes/mailAdminRoutes");

app.set("trust proxy", 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  session({
    name: "rtb.sid",
    secret: process.env.SESSION_SECRET || "dev-only-change-me",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 4,
    },
  })
);

// Servir PDFs
app.use("/uploads", express.static(path.join(__dirname, "..", "public", "uploads")));

// Montar rutas API
app.use("/api", contactRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/admin/mail", mailAdminRoutes);

// Ruta de prueba opcional
app.get("/api/status", (req, res) => {
  res.json({ message: "Servidor funcionando correctamente." });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});

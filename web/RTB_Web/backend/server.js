// backend/server.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const contactRoutes = require("./routes/contactRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const mailAdminRoutes = require("./routes/mailAdminRoutes");
const mailOpsRoutes = require("./routes/mailOpsRoutes");
const adminUsersRoutes = require("./routes/adminUsersRoutes");
const serverOpsRoutes = require("./routes/serverOpsRoutes");

app.set("trust proxy", 1);

// SESSION_SECRET es obligatorio en producción: sin él las cookies de sesión
// serían falsificables. Fallar al arrancar es preferible a correr inseguro.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("FATAL: SESSION_SECRET no está definido en .env — abortando.");
  process.exit(1);
}

// Middleware
// Sin CORS: el panel y el sitio público se sirven same-origin a través de nginx.
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));
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
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/mail", mailAdminRoutes);
app.use("/api/admin/mail", mailOpsRoutes);
app.use("/api/admin/system", serverOpsRoutes);

// Ruta de prueba opcional
app.get("/api/status", (req, res) => {
  res.json({ message: "Servidor funcionando correctamente." });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});

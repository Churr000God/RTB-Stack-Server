// backend/controllers/contactController.js
const path = require("path");
const fs = require("fs-extra");
const { generatePDF } = require("../utils/pdfGenerator");
const { createClient } = require("webdav");
require("dotenv").config();

// Crea recursivamente /Ventas/Formularios si no existe
async function ensureDir(client, dirPath) {
  const parts = dirPath.replace(/^\/+/, "").split("/");
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    try {
      // Si existe, stat no lanza error
      // eslint-disable-next-line no-await-in-loop
      await client.stat(current);
    } catch {
      // eslint-disable-next-line no-await-in-loop
      await client.createDirectory(current);
    }
  }
}

exports.handleContactForm = async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ message: "Faltan campos obligatorios." });
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = String(name).trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `contacto-${safeName}-${timestamp}.pdf`;
    const localPath = path.join(__dirname, "..", "..", "public", "uploads", fileName);

    // 1) Generar PDF local
    await generatePDF({ name, email, phone, subject, message }, localPath);
    console.log(`✅ PDF generado en: ${localPath}`);

    // 2) Subir a Nextcloud (si hay credenciales)
    const {
      NEXTCLOUD_BASE,   // ej: https://nube.refacrtb.com.mx/remote.php/webdav
      NEXTCLOUD_DIR,    // ej: /Ventas/Formularios
      NEXTCLOUD_USER,
      NEXTCLOUD_PASS
    } = process.env;

    if (NEXTCLOUD_BASE && NEXTCLOUD_USER && NEXTCLOUD_PASS) {
      const client = createClient(NEXTCLOUD_BASE, {
        username: NEXTCLOUD_USER,
        password: NEXTCLOUD_PASS,
      });

      const targetDir = (NEXTCLOUD_DIR || "/").replace(/\/+$/, ""); // sin slash final
      // Asegurar que exista la carpeta destino
      if (targetDir && targetDir !== "/") {
        await ensureDir(client, targetDir);
      }

      const remotePath = `${targetDir}/${fileName}`.replace("//", "/");
      const pdfBuffer = await fs.readFile(localPath);

      await client.putFileContents(remotePath, pdfBuffer);
      console.log("☁️  PDF subido a Nextcloud en:", remotePath);
    }

    return res.status(200).json({ message: "Formulario recibido y PDF generado con éxito." });
  } catch (error) {
    console.error("❌ Error al procesar el formulario:", error);
    return res.status(500).json({ message: "Error al generar el PDF o subirlo." });
  }
};

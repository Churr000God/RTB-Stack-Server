const fs = require("fs-extra");
const path = require("path");
const puppeteer = require("puppeteer");

async function generatePDF(data, outputPath) {
  try {
    // Ruta a la plantilla HTML
    const templatePath = path.join(__dirname, "templates", "contactoTemplate.html");

    // Leer y cargar la plantilla
    let html = await fs.readFile(templatePath, "utf8");

    // Reemplazar {{variables}} por los valores reales
    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      html = html.replace(regex, value || "");
    });

    // Lanzar Puppeteer y generar el PDF
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "1in", bottom: "1in", left: "1in", right: "1in" }
    });

    await browser.close();
  } catch (error) {
    console.error("❌ Error generando el PDF:", error);
    throw error;
  }
}

module.exports = { generatePDF };

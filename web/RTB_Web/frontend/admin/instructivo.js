(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const email = (params.get("email") || "").trim();

  const setAll = (selOrId, value, isId) => {
    if (isId) {
      const el = document.getElementById(selOrId);
      if (el) el.textContent = value;
    } else {
      document.querySelectorAll(selOrId).forEach(el => { el.textContent = value; });
    }
  };

  // Rellena el correo (puede repetirse en varias celdas).
  if (email) {
    setAll("acc-email", email, true);
    setAll("acc-email-2", email, true);
    setAll(".acc-email", email, false);
    document.title = `Guía de correo · ${email}`;
  }

  async function loadConn() {
    try {
      const res = await fetch("/api/admin/mail/connection-info", { credentials: "same-origin" });
      if (!res.ok) return;
      const c = await res.json();

      const webmail = document.getElementById("webmail-link");
      if (webmail) { webmail.textContent = c.webmail; webmail.href = c.webmail; }

      const map = {
        "imap-host": c.imap.servidor, "imap-port": c.imap.puerto, "imap-sec": c.imap.cifrado,
        "smtp-host": c.smtp.servidor, "smtp-port": c.smtp.puerto, "smtp-sec": c.smtp.cifrado,
        "s-imap-host": c.imap.servidor, "s-imap-port": c.imap.puerto, "s-imap-sec": c.imap.cifrado,
        "s-smtp-host": c.smtp.servidor, "s-smtp-port": c.smtp.puerto, "s-smtp-sec": c.smtp.cifrado,
      };
      for (const [id, val] of Object.entries(map)) setAll(id, String(val), true);
    } catch (_) { /* sin red: el documento queda con marcadores genéricos */ }
  }

  document.getElementById("printBtn").addEventListener("click", () => window.print());

  loadConn();
})();

(() => {
  "use strict";

  const API = "/api/admin";
  const MAIL_API = "/api/admin/mail";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const ERRORS = {
    no_autenticado: "Sesión expirada. Vuelve a entrar.",
    credenciales_invalidas: "Contraseña incorrecta.",
    password_requerido: "Falta la contraseña.",
    demasiados_intentos: "Demasiados intentos. Espera 15 minutos.",
    email_requerido: "Falta el correo.",
    email_invalido: "Correo con formato inválido.",
    email_demasiado_largo: "Correo demasiado largo.",
    password_corto: "Contraseña muy corta (mínimo 8).",
    password_largo: "Contraseña demasiado larga.",
    password_caracteres_invalidos: "Contraseña con caracteres no permitidos.",
    dominio_no_permitido: "Solo se aceptan cuentas @refacrtb.com.mx.",
    cuenta_existente: "Ya existe una cuenta con ese correo.",
    fallo_listar: "No se pudo obtener la lista.",
    fallo_crear: "No se pudo crear la cuenta.",
    fallo_actualizar: "No se pudo actualizar la contraseña.",
    fallo_eliminar: "No se pudo eliminar la cuenta.",
    admin_no_configurado: "El panel no está configurado en el servidor.",
  };
  const msg = (key) => ERRORS[key] || key || "Error desconocido.";

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function flash(text, kind = "ok") {
    const el = $("#flash");
    el.textContent = text;
    el.className = "flash " + (kind === "ok" ? "flash--ok" : "flash--err");
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 4000);
  }

  function genPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => chars[b % chars.length]).join("");
  }

  // ──────────── Estado / vistas ────────────
  async function checkAuth() {
    const { data } = await api(`${API}/me`);
    if (data.authenticated) {
      showAdmin();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    $("#loginView").classList.remove("hidden");
    $("#adminView").classList.add("hidden");
    $("#logoutBtn").classList.add("hidden");
    setTimeout(() => $("#pwd").focus(), 50);
  }

  function showAdmin() {
    $("#loginView").classList.add("hidden");
    $("#adminView").classList.remove("hidden");
    $("#logoutBtn").classList.remove("hidden");
    loadAccounts();
  }

  // ──────────── Login / logout ────────────
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginError").textContent = "";
    const password = $("#pwd").value;
    const { res, data } = await api(`${API}/login`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      $("#pwd").value = "";
      showAdmin();
    } else {
      $("#loginError").textContent = msg(data.error);
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await api(`${API}/logout`, { method: "POST" });
    showLogin();
  });

  // ──────────── Listar cuentas ────────────
  async function loadAccounts() {
    const tbody = $("#accountsTbody");
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Cargando…</td></tr>`;
    const { res, data } = await api(`${MAIL_API}/accounts`);
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="5" class="error">${msg(data.error)}</td></tr>`;
      return;
    }
    if (!data.accounts.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay cuentas.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.accounts.map(a => `
      <tr>
        <td>${escapeHtml(a.email)}</td>
        <td>${escapeHtml(a.usado)}</td>
        <td>${escapeHtml(a.cuota)}</td>
        <td>${a.porcentaje}%</td>
        <td class="col-actions">
          <button class="btn btn--small" data-action="pwd" data-email="${escapeHtml(a.email)}">Cambiar contraseña</button>
          <button class="btn btn--small btn--danger" data-action="del" data-email="${escapeHtml(a.email)}">Eliminar</button>
        </td>
      </tr>
    `).join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Delegación de clicks de la tabla
  $("#accountsTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const email = btn.dataset.email;
    if (btn.dataset.action === "pwd") openPwdModal(email);
    if (btn.dataset.action === "del") openDelModal(email);
  });

  // ──────────── Modales: helpers ────────────
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }
  $$("[data-close]").forEach(b => b.addEventListener("click", () => {
    b.closest(".modal").classList.add("hidden");
  }));
  $$(".modal").forEach(m => m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.add("hidden");
  }));

  // ──────────── Crear ────────────
  $("#newAccountBtn").addEventListener("click", () => {
    $("#newEmailLocal").value = "";
    $("#newPwd").value = genPassword();
    $("#createError").textContent = "";
    openModal("#createModal");
    setTimeout(() => $("#newEmailLocal").focus(), 50);
  });
  $("#genPwd").addEventListener("click", () => { $("#newPwd").value = genPassword(); });

  $("#createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#createError").textContent = "";
    const local = $("#newEmailLocal").value.trim();
    const password = $("#newPwd").value;
    const email = `${local}@refacrtb.com.mx`;
    const { res, data } = await api(`${MAIL_API}/accounts`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      closeModal("#createModal");
      flash(`Cuenta ${email} creada. Contraseña: ${password}`, "ok");
      loadAccounts();
    } else {
      $("#createError").textContent = msg(data.error);
    }
  });

  // ──────────── Cambiar contraseña ────────────
  function openPwdModal(email) {
    $("#pwdEmail").textContent = email;
    $("#pwdNew").value = genPassword();
    $("#pwdError").textContent = "";
    $("#pwdForm").dataset.email = email;
    openModal("#pwdModal");
  }
  $("#pwdGen").addEventListener("click", () => { $("#pwdNew").value = genPassword(); });

  $("#pwdForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#pwdError").textContent = "";
    const email = $("#pwdForm").dataset.email;
    const password = $("#pwdNew").value;
    const { res, data } = await api(`${MAIL_API}/accounts/${encodeURIComponent(email)}/password`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      closeModal("#pwdModal");
      flash(`Contraseña actualizada para ${email}. Nueva: ${password}`, "ok");
    } else {
      $("#pwdError").textContent = msg(data.error);
    }
  });

  // ──────────── Eliminar ────────────
  function openDelModal(email) {
    $("#delEmailLabel").textContent = email;
    $("#delConfirm").value = "";
    $("#delError").textContent = "";
    $("#delSubmit").disabled = true;
    $("#delForm").dataset.email = email;
    openModal("#delModal");
    setTimeout(() => $("#delConfirm").focus(), 50);
  }
  $("#delConfirm").addEventListener("input", (e) => {
    $("#delSubmit").disabled = e.target.value !== $("#delForm").dataset.email;
  });
  $("#delForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#delError").textContent = "";
    const email = $("#delForm").dataset.email;
    const { res, data } = await api(`${MAIL_API}/accounts/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      closeModal("#delModal");
      flash(`Cuenta ${email} eliminada.`, "ok");
      loadAccounts();
    } else {
      $("#delError").textContent = msg(data.error);
    }
  });

  // ──────────── Init ────────────
  checkAuth();
})();

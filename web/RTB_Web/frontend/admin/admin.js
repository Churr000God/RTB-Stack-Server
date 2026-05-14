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
    fallo_suspender: "No se pudo suspender el buzón.",
    fallo_reactivar: "No se pudo reactivar el buzón.",
    fallo_cuota: "No se pudo aplicar la cuota.",
    fallo_vaciar: "No se pudo vaciar el buzón.",
    cuota_invalida: "Formato de cuota inválido (ej: 5G, 500M, 0).",
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
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Cargando…</td></tr>`;
    const { res, data } = await api(`${MAIL_API}/accounts`);
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="error">${msg(data.error)}</td></tr>`;
      return;
    }
    if (!data.accounts.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No hay cuentas.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.accounts.map(a => {
      const e = escapeHtml(a.email);
      const badge = a.suspended
        ? `<span class="badge badge--off">Suspendida</span>`
        : `<span class="badge badge--ok">Activa</span>`;
      const toggleBtn = a.suspended
        ? `<button class="btn-icon btn-icon--ok" data-action="unsuspend" data-email="${e}" title="Reactivar buzón"><span class="ico">▶</span> Reactivar</button>`
        : `<button class="btn-icon" data-action="suspend" data-email="${e}" title="Suspender buzón"><span class="ico">⏸</span> Suspender</button>`;
      return `
        <tr class="${a.suspended ? "suspended" : ""}">
          <td class="col-email">${e}</td>
          <td>${badge}</td>
          <td>${escapeHtml(a.usado)}</td>
          <td>${escapeHtml(a.cuota)}</td>
          <td>${a.porcentaje}%</td>
          <td class="col-actions">
            <div class="actions">
              <button class="btn-icon" data-action="pwd" data-email="${e}" title="Cambiar contraseña"><span class="ico">\u{1F511}</span> Contraseña</button>
              <button class="btn-icon" data-action="quota" data-email="${e}" data-cuota="${escapeHtml(a.cuota)}" title="Definir cuota"><span class="ico">\u{1F4CA}</span> Cuota</button>
              ${toggleBtn}
              <button class="btn-icon btn-icon--danger" data-action="empty" data-email="${e}" title="Vaciar correos"><span class="ico">\u{1F9F9}</span> Vaciar</button>
              <button class="btn-icon btn-icon--danger" data-action="del" data-email="${e}" title="Eliminar buzón"><span class="ico">\u{1F5D1}</span> Eliminar</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Delegación de clicks de la tabla
  $("#accountsTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const email = btn.dataset.email;
    const action = btn.dataset.action;
    if (action === "pwd") openPwdModal(email);
    else if (action === "del") openDelModal(email);
    else if (action === "quota") openQuotaModal(email, btn.dataset.cuota || "");
    else if (action === "empty") openEmptyModal(email);
    else if (action === "suspend") openSuspendModal(email);
    else if (action === "unsuspend") openUnsuspendModal(email);
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
      setTimeout(loadAccounts, 2500);
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

  // ──────────── Cuota ────────────
  function openQuotaModal(email, currentQuota) {
    $("#quotaEmail").textContent = email;
    $("#quotaValue").value = currentQuota === "ilimitada" ? "" : currentQuota;
    $("#quotaError").textContent = "";
    $("#quotaForm").dataset.email = email;
    openModal("#quotaModal");
    setTimeout(() => $("#quotaValue").focus(), 50);
  }
  $("#quotaForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#quotaError").textContent = "";
    const email = $("#quotaForm").dataset.email;
    const quota = $("#quotaValue").value.trim();
    const { res, data } = await api(`${MAIL_API}/accounts/${encodeURIComponent(email)}/quota`, {
      method: "PUT",
      body: JSON.stringify({ quota }),
    });
    if (res.ok) {
      closeModal("#quotaModal");
      flash(`Cuota de ${email} = ${data.quota || quota || "sin límite"}`, "ok");
      // dovecot tarda ~2s en reflejar la cuota en 'setup email list'
      loadAccounts();
      setTimeout(loadAccounts, 2500);
    } else {
      $("#quotaError").textContent = msg(data.error);
    }
  });

  // ──────────── Vaciar buzón ────────────
  function openEmptyModal(email) {
    $("#emptyEmailLabel").textContent = email;
    $("#emptyConfirm").value = "";
    $("#emptyError").textContent = "";
    $("#emptySubmit").disabled = true;
    $("#emptyForm").dataset.email = email;
    openModal("#emptyModal");
    setTimeout(() => $("#emptyConfirm").focus(), 50);
  }
  $("#emptyConfirm").addEventListener("input", (e) => {
    $("#emptySubmit").disabled = e.target.value !== $("#emptyForm").dataset.email;
  });
  $("#emptyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#emptyError").textContent = "";
    const email = $("#emptyForm").dataset.email;
    $("#emptySubmit").disabled = true;
    $("#emptySubmit").textContent = "Vaciando…";
    const { res, data } = await api(`${MAIL_API}/accounts/${encodeURIComponent(email)}/empty`, {
      method: "POST",
    });
    $("#emptySubmit").textContent = "Vaciar";
    if (res.ok) {
      closeModal("#emptyModal");
      flash(`Buzón de ${email} vaciado.`, "ok");
      loadAccounts();
    } else {
      $("#emptyError").textContent = msg(data.error);
      $("#emptySubmit").disabled = false;
    }
  });

  // ──────────── Suspender ────────────
  function openSuspendModal(email) {
    $("#suspendEmail").textContent = email;
    $("#suspendError").textContent = "";
    $("#suspendForm").dataset.email = email;
    openModal("#suspendModal");
  }
  $("#suspendForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#suspendError").textContent = "";
    const email = $("#suspendForm").dataset.email;
    const { res, data } = await api(`${MAIL_API}/accounts/${encodeURIComponent(email)}/suspend`, {
      method: "POST",
    });
    if (res.ok) {
      closeModal("#suspendModal");
      flash(`Buzón ${email} suspendido.`, "ok");
      loadAccounts();
    } else {
      $("#suspendError").textContent = msg(data.error);
    }
  });

  // ──────────── Reactivar ────────────
  function openUnsuspendModal(email) {
    $("#unsuspendEmail").textContent = email;
    $("#unsuspendPwd").value = genPassword();
    $("#unsuspendError").textContent = "";
    $("#unsuspendForm").dataset.email = email;
    openModal("#unsuspendModal");
  }
  $("#unsuspendGen").addEventListener("click", () => { $("#unsuspendPwd").value = genPassword(); });
  $("#unsuspendForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#unsuspendError").textContent = "";
    const email = $("#unsuspendForm").dataset.email;
    const password = $("#unsuspendPwd").value;
    const { res, data } = await api(`${MAIL_API}/accounts/${encodeURIComponent(email)}/unsuspend`, {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      closeModal("#unsuspendModal");
      flash(`Buzón ${email} reactivado. Nueva contraseña: ${password}`, "ok");
      loadAccounts();
    } else {
      $("#unsuspendError").textContent = msg(data.error);
    }
  });

  // ──────────── Init ────────────
  checkAuth();
})();

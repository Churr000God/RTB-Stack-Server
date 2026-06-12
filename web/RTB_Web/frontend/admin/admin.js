(() => {
  "use strict";

  const API = "/api/admin";
  const MAIL_API = "/api/admin/mail";
  const SYS_API  = "/api/admin/system";

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
    fallo_dashboard: "No se pudo cargar el resumen.",
    fallo_storage: "No se pudo cargar el almacenamiento.",
    fallo_logs: "No se pudieron obtener los logs.",
    usuario_requerido: "Falta el usuario.",
    usuario_invalido: "Usuario inválido (3–32: letras, números, . _ -).",
    usuario_existente: "Ya existe un usuario con ese nombre.",
    usuario_no_encontrado: "Usuario no encontrado.",
    rol_invalido: "Rol inválido.",
    permiso_denegado: "No tienes permiso para esta acción.",
    no_autoeliminacion: "No puedes eliminar tu propio usuario.",
    ultimo_admin: "No puedes eliminar el último administrador.",
    // Servidor / contenedores / PM2
    fallo_host: "No se pudieron obtener las métricas del servidor.",
    fallo_containers: "No se pudo obtener el estado de los contenedores.",
    fallo_pm2: "No se pudo obtener el estado de PM2.",
    fallo_fail2ban: "No se pudo consultar fail2ban.",
    contenedor_no_permitido: "Contenedor no permitido.",
    proceso_no_permitido: "Proceso no permitido.",
    accion_invalida: "Acción no válida.",
    fallo_start: "Error al iniciar el contenedor.",
    jail_invalida: "Jail de fail2ban no válida o inexistente.",
    ip_invalida: "Dirección IP inválida.",
    fallo_ban: "No se pudo banear la IP.",
    fallo_unban: "No se pudo desbanear la IP.",
    fallo_stop: "Error al detener el contenedor.",
    fallo_restart: "Error al reiniciar.",
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

  // kind: "ok" | "err" — cualquier valor distinto de "ok" se muestra como error.
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Estado en memoria de los buzones (para filtrar/agrupar sin re-pedir).
  let ACCOUNTS = [];
  // Sesión actual.
  let SESSION = { user: null, role: null };

  // ──────────── Estado / vistas ────────────
  async function checkAuth() {
    const { data } = await api(`${API}/me`);
    if (data.authenticated) {
      SESSION = { user: data.user, role: data.role };
      showAdmin();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    $("#loginView").classList.remove("hidden");
    $("#adminView").classList.add("hidden");
    $("#logoutBtn").classList.add("hidden");
    setTimeout(() => $("#usr").focus(), 50);
  }

  function showAdmin() {
    $("#loginView").classList.add("hidden");
    $("#adminView").classList.remove("hidden");
    $("#logoutBtn").classList.remove("hidden");
    // Identidad en la barra superior.
    $("#who").textContent = SESSION.user ? `${SESSION.user} · ${SESSION.role}` : "";
    // La pestaña Administradores solo existe para el rol admin.
    const isAdmin = SESSION.role === "admin";
    $(".tab--admin").classList.toggle("hidden", !isAdmin);
    // Bloques reservados al rol admin (control del contenedor, respaldos masivos).
    $$(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
    showSection("panel");
  }

  // ──────────── Router de pestañas ────────────
  const LOADERS = {
    panel: loadDashboard,
    buzones: loadAccounts,
    storage: loadStorage,
    audit: loadAudit,
    guide: loadGuide,
    dns: loadDns,
    monitor: loadMonitor,
    servidor: loadServidor,
    users: loadUsers,
  };

  function showSection(name) {
    stopLiveLogs(); // cerrar stream SSE si el usuario cambia de pestaña
    $$(".section").forEach(s => s.classList.add("hidden"));
    const sec = $(`#sec-${name}`);
    if (sec) sec.classList.remove("hidden");
    $$(".tab").forEach(t => {
      const active = t.dataset.section === name;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    });
    const loader = LOADERS[name];
    if (loader) loader();
  }

  $("#tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) showSection(tab.dataset.section);
  });

  // Botones "Refrescar" de cada sección.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-refresh]");
    if (btn && LOADERS[btn.dataset.refresh]) LOADERS[btn.dataset.refresh]();
  });

  // ──────────── Login / logout ────────────
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginError").textContent = "";
    const username = $("#usr").value.trim();
    const password = $("#pwd").value;
    const { res, data } = await api(`${API}/login`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      $("#pwd").value = "";
      SESSION = { user: data.user, role: data.role };
      showAdmin();
    } else {
      $("#loginError").textContent = msg(data.error);
    }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    await api(`${API}/logout`, { method: "POST" });
    showLogin();
  });

  // ──────────── Buzones: listar + agrupar + buscar ────────────
  async function loadAccounts() {
    const tbody = $("#accountsTbody");
    tbody.innerHTML = `<tr><td colspan="6" class="muted"><span class="spinner"></span> Cargando…</td></tr>`;
    const { res, data } = await api(`${MAIL_API}/accounts`);
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="error">${msg(data.error)}</td></tr>`;
      return;
    }
    ACCOUNTS = data.accounts || [];
    renderAccounts($("#searchBox").value.trim().toLowerCase());
    renderGuideList($("#guideSearch").value.trim().toLowerCase());
  }

  function groupByDomain(accounts) {
    const map = new Map();
    for (const a of accounts) {
      const dom = (a.email.split("@")[1] || "—").toLowerCase();
      if (!map.has(dom)) map.set(dom, []);
      map.get(dom).push(a);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderAccounts(filter) {
    const tbody = $("#accountsTbody");
    const list = filter ? ACCOUNTS.filter(a => a.email.toLowerCase().includes(filter)) : ACCOUNTS;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Sin resultados.</td></tr>`;
      return;
    }
    let html = "";
    for (const [dom, accts] of groupByDomain(list)) {
      html += `<tr class="domain-row"><td colspan="6">📂 ${escapeHtml(dom)} <span class="muted">(${accts.length} buzón${accts.length === 1 ? "" : "es"})</span></td></tr>`;
      for (const a of accts) {
        const e = escapeHtml(a.email);
        const badge = a.suspended
          ? `<span class="badge badge--off">Suspendida</span>`
          : `<span class="badge badge--ok">Activa</span>`;
        const toggleBtn = a.suspended
          ? `<button class="btn-icon btn-icon--ok" data-action="unsuspend" data-email="${e}" title="Reactivar buzón"><span class="ico">▶</span><span class="btn-icon__label"> Reactivar</span></button>`
          : `<button class="btn-icon" data-action="suspend" data-email="${e}" title="Suspender buzón"><span class="ico">⏸</span><span class="btn-icon__label"> Desactivar</span></button>`;
        html += `
          <tr class="${a.suspended ? "suspended" : ""}">
            <td class="col-email" data-label="Correo">${e}</td>
            <td data-label="Estado">${badge}</td>
            <td data-label="Usado">${escapeHtml(a.usado)}</td>
            <td data-label="Cuota">${escapeHtml(a.cuota)}</td>
            <td data-label="%">${a.porcentaje}%</td>
            <td class="col-actions" data-label="Acciones">
              <div class="actions">
                <button class="btn-icon" data-action="pwd" data-email="${e}" title="Cambiar contraseña"><span class="ico">\u{1F511}</span><span class="btn-icon__label"> Pass</span></button>
                <button class="btn-icon" data-action="quota" data-email="${e}" data-cuota="${escapeHtml(a.cuota)}" title="Definir cuota"><span class="ico">\u{1F4BE}</span><span class="btn-icon__label"> Quota</span></button>
                ${toggleBtn}
                <button class="btn-icon" data-action="instructivo" data-email="${e}" title="Ver instructivo"><span class="ico">\u{1F4C4}</span><span class="btn-icon__label"> Instructivo</span></button>
                <button class="btn-icon" data-action="backup" data-email="${e}" title="Descargar respaldo"><span class="ico">\u{1F4BE}</span><span class="btn-icon__label"> Respaldo</span></button>
                <button class="btn-icon btn-icon--danger" data-action="empty" data-email="${e}" title="Vaciar correos"><span class="ico">\u{1F9F9}</span><span class="btn-icon__label"> Vaciar</span></button>
                <button class="btn-icon btn-icon--danger" data-action="del" data-email="${e}" title="Eliminar buzón"><span class="ico">\u{1F5D1}</span><span class="btn-icon__label"> Eliminar</span></button>
              </div>
            </td>
          </tr>`;
      }
    }
    tbody.innerHTML = html;
  }

  $("#searchBox").addEventListener("input", (e) => renderAccounts(e.target.value.trim().toLowerCase()));

  // Delegación de clicks de la tabla de buzones
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
    else if (action === "instructivo") openInstructivo(email);
    else if (action === "backup") downloadBackup(`account/${encodeURIComponent(email)}`);
  });

  function openInstructivo(email) {
    window.open(`instructivo.html?email=${encodeURIComponent(email)}`, "_blank", "noopener");
  }

  // Descargas autenticadas (cookie same-origin) — un enlace temporal dispara el navegador.
  function downloadBackup(pathSuffix) {
    const a = document.createElement("a");
    a.href = `${MAIL_API}/backup/${pathSuffix}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    flash("Preparando respaldo… la descarga iniciará en breve.", "ok");
  }

  // ──────────── Dashboard ────────────
  async function loadDashboard() {
    const kpis = $("#kpis");
    kpis.innerHTML = `<div class="muted"><span class="spinner"></span> Cargando…</div>`;
    const { res, data } = await api(`${MAIL_API}/dashboard`);
    if (res.status === 401) return showLogin();
    if (!res.ok) { kpis.innerHTML = `<div class="error">${msg(data.error)}</div>`; return; }
    const c = data.contenedor || {};
    const cBadge = c.status === "running"
      ? `<span class="badge badge--ok">running</span>`
      : `<span class="badge badge--off">${escapeHtml(c.status || "?")}</span>`;
    kpis.innerHTML = `
      ${kpi("Buzones", data.total)}
      ${kpi("Activos", data.activos)}
      ${kpi("Suspendidos", data.suspendidos)}
      ${kpi("Almacenamiento", data.almacenamientoTotal)}
      ${kpi("Contenedor", cBadge + (c.health && c.health !== "n/a" ? ` <span class="muted">${escapeHtml(c.health)}</span>` : ""))}
    `;
    const tbody = $("#panelDomains tbody");
    tbody.innerHTML = (data.dominios || []).map(d =>
      `<tr><td data-label="Dominio">📂 ${escapeHtml(d.dominio)}</td><td data-label="Buzones">${d.buzones}</td><td data-label="Disco">${escapeHtml(d.disco)}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="muted">Sin dominios.</td></tr>`;
  }
  const kpi = (label, val) => `<div class="kpi"><div class="kpi__val">${val}</div><div class="kpi__label">${escapeHtml(label)}</div></div>`;

  // ──────────── Almacenamiento ────────────
  async function loadStorage() {
    const wrap = $("#storageWrap");
    wrap.innerHTML = `<p class="muted"><span class="spinner"></span> Cargando…</p>`;
    const { res, data } = await api(`${MAIL_API}/storage`);
    if (res.status === 401) return showLogin();
    if (!res.ok) { wrap.innerHTML = `<p class="error">${msg(data.error)}</p>`; return; }
    const isAdmin = SESSION.role === "admin";
    wrap.innerHTML = (data.dominios || []).map(d => `
      <div class="card mb-16">
        <div class="row row--space">
          <h2>📂 ${escapeHtml(d.dominio)}</h2>
          <div class="row row--wrap">
            <span class="muted">${d.buzones.length} buzones · Disco: ${escapeHtml(d.disco)}</span>
            ${isAdmin ? `<button class="btn btn--small" data-backup-domain="${escapeHtml(d.dominio)}">⬇️ Respaldo dominio</button>` : ""}
          </div>
        </div>
        <table class="accounts">
          <thead><tr><th>Buzón</th><th>Usado</th><th>Cuota</th><th>%</th></tr></thead>
          <tbody>${d.buzones.map(b =>
            `<tr><td class="col-email" data-label="Buzón">${escapeHtml(b.email)}</td><td data-label="Usado">${escapeHtml(b.usado)}</td><td data-label="Cuota">${escapeHtml(b.cuota)}</td><td data-label="%">${b.porcentaje}%</td></tr>`
          ).join("")}</tbody>
        </table>
      </div>
    `).join("") || `<p class="muted">Sin datos.</p>`;
  }

  $("#storageWrap").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-backup-domain]");
    if (btn) downloadBackup(`domain/${encodeURIComponent(btn.dataset.backupDomain)}`);
  });

  // ──────────── Auditoría ────────────
  const ACTION_LABELS = {
    create_mailbox: "Crear buzón", change_password: "Cambiar contraseña", delete_mailbox: "Eliminar buzón",
    suspend: "Suspender", unsuspend: "Reactivar", set_quota: "Definir cuota", empty_mailbox: "Vaciar buzón",
    backup_mailbox: "Respaldo buzón", backup_domain: "Respaldo dominio", backup_all: "Respaldo total",
    container_start: "Levantar servidor correo", container_stop: "Detener servidor correo", container_restart: "Reiniciar servidor correo",
    docker_start: "Iniciar contenedor", docker_stop: "Detener contenedor", docker_restart: "Reiniciar contenedor",
    pm2_restart: "Reiniciar backend (PM2)",
    f2b_ban: "Banear IP (fail2ban)", f2b_unban: "Desbanear IP (fail2ban)",
  };
  async function loadAudit() {
    const tbody = $("#auditTbody");
    tbody.innerHTML = `<tr><td colspan="5" class="muted"><span class="spinner"></span> Cargando…</td></tr>`;
    const { res, data } = await api(`${MAIL_API}/audit?limit=300`);
    if (res.status === 401) return showLogin();
    const entries = data.entries || [];
    if (!entries.length) { tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin registros.</td></tr>`; return; }
    tbody.innerHTML = entries.map(en => {
      const fecha = new Date(en.ts).toLocaleString("es-MX");
      const accion = ACTION_LABELS[en.action] || en.action;
      return `<tr><td data-label="Fecha">${escapeHtml(fecha)}</td><td data-label="Admin">${escapeHtml(en.admin || "admin")}</td><td data-label="Acción">${escapeHtml(accion)}</td><td class="col-email" data-label="Objetivo">${escapeHtml(en.target || "")}</td><td class="muted" data-label="Detalles">${escapeHtml(en.details || "")}</td></tr>`;
    }).join("");
  }

  // ──────────── Guía de conexión + instructivos ────────────
  async function loadGuide() {
    const grid = $("#guideServer");
    grid.innerHTML = `<div class="muted"><span class="spinner"></span> Cargando…</div>`;
    const { res, data } = await api(`${MAIL_API}/connection-info`);
    if (res.status === 401) return showLogin();
    if (res.ok) {
      grid.innerHTML = `
        ${connCard("🌐 Webmail", [["URL", data.webmail]])}
        ${connCard("📥 IMAP — Entrante", [["Servidor", data.imap.servidor], ["Puerto", data.imap.puerto], ["Cifrado", data.imap.cifrado]])}
        ${connCard("📤 SMTP — Saliente", [["Servidor", data.smtp.servidor], ["Puerto", data.smtp.puerto], ["Cifrado", data.smtp.cifrado]])}
        ${connCard("📨 POP3 — Alternativo", [["Servidor", data.pop3.servidor], ["Puerto", data.pop3.puerto], ["Cifrado", data.pop3.cifrado]])}
      `;
    } else {
      grid.innerHTML = `<div class="error">${msg(data.error)}</div>`;
    }
    if (!ACCOUNTS.length) await loadAccounts();
    else renderGuideList($("#guideSearch").value.trim().toLowerCase());
  }
  const connCard = (title, rows) => `
    <div class="conn-card">
      <h3>${title}</h3>
      <table>${rows.map(([k, v]) => `<tr><td class="muted">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`).join("")}</table>
    </div>`;

  function renderGuideList(filter) {
    const tbody = $("#guideTbody");
    if (!tbody) return;
    const list = filter ? ACCOUNTS.filter(a => a.email.toLowerCase().includes(filter)) : ACCOUNTS;
    if (!list.length) { tbody.innerHTML = `<tr><td colspan="3" class="muted">Sin buzones.</td></tr>`; return; }
    let html = "";
    for (const [dom, accts] of groupByDomain(list)) {
      html += `<tr class="domain-row"><td colspan="3">📂 ${escapeHtml(dom)} <span class="muted">(${accts.length})</span></td></tr>`;
      for (const a of accts) {
        const e = escapeHtml(a.email);
        const badge = a.suspended ? `<span class="badge badge--off">Suspendida</span>` : `<span class="badge badge--ok">Activa</span>`;
        html += `<tr><td class="col-email" data-label="Buzón">${e}</td><td data-label="Estado">${badge}</td><td class="col-actions" data-label="Instructivo"><button class="btn-icon" data-guide-email="${e}" title="Ver instructivo"><span class="ico">\u{1F4C4}</span><span class="btn-icon__label"> Ver instructivo</span></button></td></tr>`;
      }
    }
    tbody.innerHTML = html;
  }
  $("#guideSearch").addEventListener("input", (e) => renderGuideList(e.target.value.trim().toLowerCase()));
  $("#guideTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-guide-email]");
    if (btn) openInstructivo(btn.dataset.guideEmail);
  });

  // ──────────── Verificador DNS ────────────
  async function loadDns() {
    const tbody = $("#dnsTbody");
    tbody.innerHTML = `<tr><td colspan="4" class="muted"><span class="spinner"></span> Verificando…</td></tr>`;
    const { res, data } = await api(`${MAIL_API}/dns`);
    if (res.status === 401) return showLogin();
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="4" class="error">${msg(data.error)}</td></tr>`; return; }
    tbody.innerHTML = (data.checks || []).map(c => {
      const cls = c.estado === "ok" ? "badge--ok" : (c.estado === "warn" ? "badge--warn" : "badge--off");
      const txt = c.estado === "ok" ? "OK" : (c.estado === "warn" ? "Revisar" : "Falta");
      return `<tr><td data-label="Registro"><strong>${escapeHtml(c.tipo)}</strong></td><td class="muted" data-label="Esperado">${escapeHtml(c.esperado)}</td><td class="break-all" data-label="Encontrado">${escapeHtml(c.encontrado)}</td><td data-label="Estado"><span class="badge ${cls}">${txt}</span></td></tr>`;
    }).join("");
  }

  // ──────────── Monitor del contenedor ────────────
  async function loadMonitor() {
    const wrap = $("#monitorStatus");
    wrap.innerHTML = `<div class="muted"><span class="spinner"></span> Cargando…</div>`;
    const { res, data } = await api(`${MAIL_API}/container/status`);
    if (res.status === 401) return showLogin();
    if (res.ok) {
      const sBadge = data.status === "running"
        ? `<span class="badge badge--ok">running</span>`
        : `<span class="badge badge--off">${escapeHtml(data.status || "?")}</span>`;
      wrap.innerHTML = `
        ${kpi("Estado", sBadge)}
        ${kpi("Salud", data.health === "saludable" || data.health === "healthy"
          ? `<span class="badge badge--ok">${escapeHtml(data.health)}</span>`
          : data.health === "caído" || data.health === "unhealthy"
            ? `<span class="badge badge--off">${escapeHtml(data.health)}</span>`
            : `<span class="badge">${escapeHtml(data.health || "n/a")}</span>`)}
        ${kpi("CPU", escapeHtml(data.cpu || "—"))}
        ${kpi("Memoria", escapeHtml(data.mem || "—"))}
      `;
    } else {
      wrap.innerHTML = `<div class="error">No se pudo leer el estado del contenedor.</div>`;
    }
    loadLogs();
  }

  async function loadLogs() {
    const pre = $("#monitorLogs");
    pre.textContent = "Cargando…";
    const res = await fetch(`${MAIL_API}/container/logs?lines=200`, { credentials: "same-origin" });
    if (res.status === 401) return showLogin();
    pre.textContent = res.ok ? await res.text() : "No se pudieron obtener los logs.";
    pre.scrollTop = pre.scrollHeight;
  }
  $("#logsRefresh").addEventListener("click", loadLogs);

  $("#backupAllBtn").addEventListener("click", () => {
    if (confirm("El respaldo total descarga TODO el correo (~varios GB) y puede tardar minutos. ¿Continuar?")) {
      downloadBackup("all");
    }
  });

  // ──────────── Control de ciclo de vida del contenedor ────────────
  const CTL_BTNS = ["#ctlStart", "#ctlRestart", "#ctlStop"];
  async function containerAction(action, label) {
    if (!confirm(`¿Seguro que deseas ${label} el servidor de correo?`)) return;
    const msgEl = $("#ctlMsg");
    CTL_BTNS.forEach(sel => { $(sel).disabled = true; });
    msgEl.textContent = "Ejecutando…";
    const { res, data } = await api(`${MAIL_API}/container/${action}`, { method: "POST" });
    CTL_BTNS.forEach(sel => { $(sel).disabled = false; });
    if (res.status === 401) return showLogin();
    if (res.ok) {
      flash(`Acción "${label}" completada. Estado: ${data.status || "?"}`, "ok");
      msgEl.textContent = "";
      loadMonitor();
    } else {
      flash(`Error al ${label}: ${msg(data.error)}`, "err");
      msgEl.textContent = "";
    }
  }
  $("#ctlStart").addEventListener("click",   () => containerAction("start",   "levantar"));
  $("#ctlRestart").addEventListener("click", () => containerAction("restart", "reiniciar"));
  $("#ctlStop").addEventListener("click",    () => containerAction("stop",    "detener"));

  // ──────────── Panel: Servidor e infraestructura ───────────────────────────

  // Estado del stream SSE de logs en vivo
  let liveSource = null;

  // Orquestador principal de la pestaña
  async function loadServidor() {
    loadHostStats();
    loadContainers();
    loadPm2();
    loadFail2ban();
  }

  // ── Métricas del host ────────────────────────────────────────────────────
  async function loadHostStats() {
    const div = $("#hostStats");
    div.innerHTML = `<div class="kpi"><div class="kpi__val muted">—</div><div class="kpi__label"><span class="spinner"></span> Cargando…</div></div>`;
    const { res, data } = await api(`${SYS_API}/host`);
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      div.innerHTML = `<div class="error">${msg(data.error)}</div>`;
      return;
    }
    const swapVal = data.swapWarning
      ? `<span class="badge badge--warn">0 B ⚠️</span>`
      : `${escapeHtml(data.swapUsed)} / ${escapeHtml(data.swapTotal)} <span class="muted">(${data.swapPct}%)</span>`;
    div.innerHTML = `
      ${kpi("CPU", `${data.cpuCores} núcleos`)}
      ${kpi("Carga 1/5/15 min", `${escapeHtml(data.load1)} / ${escapeHtml(data.load5)} / ${escapeHtml(data.load15)}`)}
      ${kpi("RAM", `${escapeHtml(data.memUsed)} / ${escapeHtml(data.memTotal)}<br><span class="muted">${data.memPct}%</span>`)}
      ${kpi("Swap", swapVal)}
      ${kpi("Disco (/)", `${escapeHtml(data.diskUsed)} / ${escapeHtml(data.diskTotal)}<br><span class="muted">${data.diskPct}%</span>`)}
      ${kpi("Uptime", escapeHtml(data.uptime))}
    `;
  }

  // ── Tabla de contenedores ────────────────────────────────────────────────
  async function loadContainers() {
    const tbody = $("#containersTbody");
    tbody.innerHTML = `<tr><td colspan="5" class="muted"><span class="spinner"></span> Cargando…</td></tr>`;
    const { res, data } = await api(`${SYS_API}/containers`);
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="5" class="error">${msg(data.error)}</td></tr>`;
      return;
    }
    renderContainers(data.containers || []);
  }

  function renderContainers(containers) {
    const tbody   = $("#containersTbody");
    const isAdmin = SESSION.role === "admin";

    // Actualizar el selector de logs con los contenedores actuales
    const sel = $("#logTarget");
    const prev = sel.value;
    sel.innerHTML = `<option value="">— elegir contenedor —</option>` +
      containers.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
    if (containers.some(c => c.name === prev)) sel.value = prev;

    if (!containers.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin contenedores.</td></tr>`;
      return;
    }

    tbody.innerHTML = containers.map(c => {
      const running = c.state === "running";
      const badgeCls = running ? "badge--ok"
        : (c.state === "exited" || c.state === "dead" || c.state === "no_encontrado") ? "badge--off"
        : "badge--warn";
      const stateLabel = c.state === "no_encontrado" ? "ausente" : escapeHtml(c.state);
      const badge = `<span class="badge ${badgeCls}">${stateLabel}</span>`;
      const statusNote = c.statusStr && c.statusStr !== "—"
        ? ` <span class="muted status-note">${escapeHtml(c.statusStr)}</span>`
        : "";

      let actions = `<span class="muted">—</span>`;
      if (isAdmin && c.state !== "no_encontrado") {
        const startBtn   = !running
          ? `<button class="btn-icon btn-icon--ok" data-caction="start" data-cname="${escapeHtml(c.name)}" title="Iniciar"><span class="ico">▶</span><span class="btn-icon__label"> Iniciar</span></button>`
          : "";
        const restartBtn = running
          ? `<button class="btn-icon" data-caction="restart" data-cname="${escapeHtml(c.name)}" title="Reiniciar"><span class="ico">🔄</span><span class="btn-icon__label"> Reiniciar</span></button>`
          : "";
        const stopBtn    = running
          ? `<button class="btn-icon btn-icon--danger" data-caction="stop" data-cname="${escapeHtml(c.name)}" title="Detener"><span class="ico">⏹</span><span class="btn-icon__label"> Detener</span></button>`
          : "";
        actions = `<div class="actions">${startBtn}${restartBtn}${stopBtn}</div>`;
      }

      return `<tr>
        <td data-label="Contenedor"><strong>${escapeHtml(c.name)}</strong></td>
        <td data-label="Estado">${badge}${statusNote}</td>
        <td data-label="CPU">${escapeHtml(c.cpu || "—")}</td>
        <td data-label="Memoria">${escapeHtml(c.mem || "—")}</td>
        <td class="col-actions" data-label="Acciones">${actions}</td>
      </tr>`;
    }).join("");
  }

  // Delegación de clicks en la tabla de contenedores
  $("#containersTbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-caction]");
    if (!btn) return;
    await serverContainerAction(btn.dataset.cname, btn.dataset.caction);
  });

  async function serverContainerAction(name, action) {
    const actionLabel = action === "start" ? "iniciar" : action === "stop" ? "detener" : "reiniciar";
    let confirmMsg = `¿Seguro que deseas ${actionLabel} el contenedor "${name}"?`;
    if (name === "rtb_web") {
      confirmMsg += "\n\n⚠️ Esto interrumpirá el acceso web y a este panel temporalmente.";
    }
    if (!confirm(confirmMsg)) return;

    // Deshabilitar botones durante la operación
    $("#containersTbody").querySelectorAll("button[data-caction]").forEach(b => { b.disabled = true; });

    const { res, data } = await api(
      `${SYS_API}/containers/${encodeURIComponent(name)}/${action}`,
      { method: "POST" }
    );

    if (res.status === 401) return showLogin();
    if (res.ok) {
      flash(`Contenedor "${name}" — ${actionLabel} completado. Estado: ${data.state || "?"}`, "ok");
      loadContainers();
    } else {
      flash(`Error al ${actionLabel} "${name}": ${msg(data.error)}`, "err");
      // Rehabilitar botones si hubo error (loadContainers re-renderiza los botones en caso de éxito)
      $("#containersTbody").querySelectorAll("button[data-caction]").forEach(b => { b.disabled = false; });
    }
  }

  // Botón de refrescar contenedores
  $("#containersRefresh").addEventListener("click", loadContainers);

  // ── Backend PM2 ──────────────────────────────────────────────────────────
  async function loadPm2() {
    const statusDiv   = $("#pm2Status");
    const controlsDiv = $("#pm2Controls");
    statusDiv.innerHTML   = `<div class="kpi"><div class="kpi__val muted">—</div><div class="kpi__label"><span class="spinner"></span> Cargando…</div></div>`;
    controlsDiv.innerHTML = "";
    const { res, data } = await api(`${SYS_API}/pm2`);
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      statusDiv.innerHTML = `<div class="error">${msg(data.error)}</div>`;
      return;
    }
    const procs = data.procs || [];
    if (!procs.length) {
      statusDiv.innerHTML   = `<p class="muted">No se encontraron procesos PM2 en la lista de monitoreo.</p>`;
      controlsDiv.innerHTML = "";
      return;
    }
    const p = procs[0]; // rtb_backend
    const sBadge = p.status === "online"
      ? `<span class="badge badge--ok">online</span>`
      : p.status === "stopped" || p.status === "errored"
      ? `<span class="badge badge--off">${escapeHtml(p.status)}</span>`
      : `<span class="badge badge--warn">${escapeHtml(p.status || "?")}</span>`;
    statusDiv.innerHTML = `
      ${kpi("Proceso",   escapeHtml(p.name))}
      ${kpi("Estado",    sBadge)}
      ${kpi("CPU",       escapeHtml(p.cpuStr || "—"))}
      ${kpi("Memoria",   escapeHtml(p.memMB  || "—"))}
      ${kpi("Uptime",    escapeHtml(p.uptimeStr || "—"))}
      ${kpi("Reinicios", String(p.restarts || 0))}
    `;
    if (SESSION.role === "admin") {
      controlsDiv.innerHTML = `
        <button class="btn" id="pm2RestartBtn" data-pm2proc="${escapeHtml(p.name)}">
          🔄 Reiniciar ${escapeHtml(p.name)}
        </button>
        <span class="muted" style="margin-left:8px;font-size:12px">
          ⚠️ El backend se reiniciará unos segundos — el panel volverá a conectarse solo.
        </span>`;
    } else {
      controlsDiv.innerHTML = `<p class="muted">Solo el rol <strong>admin</strong> puede reiniciar procesos PM2.</p>`;
    }
  }

  // Botón de refrescar PM2
  $("#pm2Refresh").addEventListener("click", loadPm2);

  // Delegación en el contenedor de controles PM2
  $("#pm2Controls").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pm2proc]");
    if (btn) pm2Restart(btn.dataset.pm2proc);
  });

  async function pm2Restart(proc) {
    if (!confirm(
      `¿Reiniciar el proceso PM2 "${proc}"?\n\n` +
      "⚠️ El backend se reiniciará. Este panel quedará inaccesible por unos segundos y luego volverá solo."
    )) return;
    const { res, data } = await api(
      `${SYS_API}/pm2/${encodeURIComponent(proc)}/restart`,
      { method: "POST" }
    );
    if (res.status === 401) return showLogin();
    if (res.ok) {
      flash(`"${proc}" reiniciándose. El panel volverá en unos segundos.`, "ok");
      // Sondeo para actualizar el estado cuando PM2 levante de nuevo
      setTimeout(loadPm2, 3500);
      setTimeout(loadPm2, 7000);
    } else {
      flash(`Error al reiniciar "${proc}": ${msg(data.error)}`, "err");
    }
  }

  // ── Fail2ban ─────────────────────────────────────────────────────────────
  async function loadFail2ban() {
    const div = $("#fail2banStatus");
    div.innerHTML = `<p class="muted"><span class="spinner"></span> Consultando fail2ban…</p>`;
    const { res, data } = await api(`${SYS_API}/fail2ban`);
    if (res.status === 401) return showLogin();
    if (!res.ok) {
      div.innerHTML = `<p class="error">${msg(data.error)}</p>`;
      return;
    }
    if (!data.disponible) {
      div.innerHTML = `<p class="muted">⚠️ fail2ban no disponible o el servidor de correo está detenido.</p>`;
      return;
    }
    const jails = data.jails || [];
    if (!jails.length) {
      div.innerHTML = `<p class="muted">No hay jails configurados.</p>`;
      return;
    }
    const isAdmin = SESSION.role === "admin";
    const ipCell = (j) => {
      if (!j.ips.length) return "—";
      return j.ips.map(ip => {
        const e = escapeHtml(ip);
        const unbanBtn = isAdmin
          ? `<button class="ip-chip__x" data-f2b-unban data-jail="${escapeHtml(j.jail)}" data-ip="${e}" title="Desbanear ${e}" aria-label="Desbanear ${e}">✕</button>`
          : "";
        return `<span class="ip-chip"><code>${e}</code>${unbanBtn}</span>`;
      }).join(" ");
    };
    const banForm = isAdmin ? `
      <form id="f2bBanForm" class="row row--wrap mt-12" autocomplete="off">
        <select id="f2bJail" class="select select--inline" aria-label="Jail">
          ${jails.map(j => `<option value="${escapeHtml(j.jail)}">${escapeHtml(j.jail)}</option>`).join("")}
        </select>
        <input id="f2bIp" type="text" class="input--inline" placeholder="IP a banear (ej: 203.0.113.5)"
               pattern="[0-9a-fA-F.:]+" required aria-label="IP a banear">
        <button class="btn btn--danger btn--small" type="submit">🚫 Banear IP</button>
      </form>
      <p class="muted mt-8">El baneo aplica de inmediato en la jail elegida. Las IPs baneadas muestran ✕ para desbanear.</p>` : "";
    div.innerHTML = `
      <table class="accounts">
        <thead>
          <tr>
            <th>Jail</th>
            <th>Fallidos (act.)</th>
            <th>Baneados (act.)</th>
            <th>Total baneados</th>
            <th>IPs baneadas</th>
          </tr>
        </thead>
        <tbody>
          ${jails.map(j => `
            <tr>
              <td data-label="Jail"><strong>${escapeHtml(j.jail)}</strong></td>
              <td data-label="Fallidos">${j.failed}</td>
              <td data-label="Baneados">${j.banned > 0
                ? `<span class="badge badge--off">${j.banned}</span>`
                : String(j.banned)}</td>
              <td class="muted" data-label="Total">${j.totalBanned}</td>
              <td class="break-all ip-list" data-label="IPs baneadas">${ipCell(j)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${banForm}
    `;
  }

  // Banear / desbanear IPs (solo admin) — delegación sobre el contenedor,
  // porque el contenido se re-renderiza en cada refresco.
  async function f2bAction(jail, action, ip) {
    const verbo = action === "ban" ? "banear" : "desbanear";
    if (!confirm(`¿Seguro que deseas ${verbo} la IP ${ip} en la jail "${jail}"?`)) return;
    const { res, data } = await api(
      `${SYS_API}/fail2ban/${encodeURIComponent(jail)}/${action}`,
      { method: "POST", body: JSON.stringify({ ip }) }
    );
    if (res.status === 401) return showLogin();
    if (res.ok) {
      flash(`IP ${ip} ${action === "ban" ? "baneada en" : "desbaneada de"} "${jail}".`, "ok");
      loadFail2ban();
    } else {
      flash(`Error al ${verbo} ${ip}: ${msg(data.error)}`, "err");
    }
  }

  $("#fail2banStatus").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-f2b-unban]");
    if (btn) f2bAction(btn.dataset.jail, "unban", btn.dataset.ip);
  });

  $("#fail2banStatus").addEventListener("submit", (e) => {
    if (e.target.id !== "f2bBanForm") return;
    e.preventDefault();
    const jail = $("#f2bJail").value;
    const ip = $("#f2bIp").value.trim();
    if (!ip) return;
    f2bAction(jail, "ban", ip);
  });

  // Botón de refrescar fail2ban
  $("#fail2banRefresh").addEventListener("click", loadFail2ban);

  // ── Visor de logs ────────────────────────────────────────────────────────
  async function loadServerLogs() {
    const pre  = $("#serverLogs");
    const name = $("#logTarget").value;
    if (!name) {
      pre.textContent = "Selecciona un contenedor para ver sus logs.";
      return;
    }
    stopLiveLogs();
    pre.textContent = "Cargando…";
    const res = await fetch(
      `${SYS_API}/containers/${encodeURIComponent(name)}/logs?lines=300`,
      { credentials: "same-origin" }
    );
    if (res.status === 401) return showLogin();
    pre.textContent = res.ok ? await res.text() : "No se pudieron obtener los logs.";
    pre.scrollTop = pre.scrollHeight;
  }

  function startLiveLogs(name) {
    stopLiveLogs();
    const pre = $("#serverLogs");
    pre.textContent = `[Conectando a logs en vivo de "${name}"…]\n`;

    liveSource = new EventSource(
      `${SYS_API}/containers/${encodeURIComponent(name)}/logs/stream`
    );

    liveSource.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.tipo === "log") {
          const nearBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 120;
          pre.textContent += ev.linea + "\n";
          if (nearBottom) pre.scrollTop = pre.scrollHeight;
        } else if (ev.tipo === "error") {
          pre.textContent += `[Error del servidor: ${ev.mensaje}]\n`;
        } else if (ev.tipo === "fin") {
          pre.textContent += "[Contenedor detuvo el stream]\n";
          stopLiveLogs();
        }
      } catch (_) {}
    };

    liveSource.onerror = () => {
      pre.textContent += "[⚠ Stream desconectado]\n";
      stopLiveLogs();
      checkAuth(); // si la sesión expiró, vuelve al login
    };

    const btn = $("#serverLogsLive");
    if (btn) { btn.textContent = "⏹ Detener"; btn.classList.add("btn--primary"); }
  }

  function stopLiveLogs() {
    if (liveSource) { liveSource.close(); liveSource = null; }
    const btn = $("#serverLogsLive");
    if (btn) { btn.textContent = "▶ En vivo"; btn.classList.remove("btn--primary"); }
  }

  $("#serverLogsRefresh").addEventListener("click", loadServerLogs);

  $("#serverLogsLive").addEventListener("click", () => {
    const name = $("#logTarget").value;
    if (!name) { flash("Selecciona un contenedor primero.", "err"); return; }
    if (liveSource) {
      stopLiveLogs();
    } else {
      startLiveLogs(name);
    }
  });

  // Cambiar el contenedor del selector cierra el stream en vivo
  $("#logTarget").addEventListener("change", () => {
    stopLiveLogs();
    $("#serverLogs").textContent = "Selecciona un contenedor para ver sus logs.";
  });

  // ──────────── Modales: helpers ────────────
  // Abren con foco en el primer campo, cierran con Escape / click fuera /
  // [data-close], devuelven el foco al elemento que los abrió y bloquean el
  // scroll del body mientras están visibles.
  let modalTrigger = null;
  function openModal(id) {
    modalTrigger = document.activeElement;
    const m = $(id);
    m.classList.remove("hidden");
    document.body.classList.add("modal-open");
    const first = m.querySelector("input, select, textarea");
    if (first) setTimeout(() => first.focus(), 50);
  }
  function closeModal(target) {
    const m = typeof target === "string" ? $(target) : target;
    if (!m || m.classList.contains("hidden")) return;
    m.classList.add("hidden");
    document.body.classList.remove("modal-open");
    if (modalTrigger && document.body.contains(modalTrigger)) modalTrigger.focus();
    modalTrigger = null;
  }
  $$("[data-close]").forEach(b => b.addEventListener("click", () => closeModal(b.closest(".modal"))));
  $$(".modal").forEach(m => m.addEventListener("click", (e) => {
    if (e.target === m) closeModal(m);
  }));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = $$(".modal").find(m => !m.classList.contains("hidden"));
    if (open) closeModal(open);
  });

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

  // ──────────── Administradores (solo rol admin) ────────────
  async function loadUsers() {
    const tbody = $("#usersTbody");
    tbody.innerHTML = `<tr><td colspan="4" class="muted"><span class="spinner"></span> Cargando…</td></tr>`;
    const { res, data } = await api(`${API}/users`);
    if (res.status === 401) return showLogin();
    if (res.status === 403) { tbody.innerHTML = `<tr><td colspan="4" class="error">${msg("permiso_denegado")}</td></tr>`; return; }
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="4" class="error">${msg(data.error)}</td></tr>`; return; }
    const users = data.users || [];
    tbody.innerHTML = users.map(u => {
      const isSelf = SESSION.user && u.username.toLowerCase() === SESSION.user.toLowerCase();
      const roleBadge = u.role === "admin"
        ? `<span class="badge badge--ok">admin</span>`
        : `<span class="badge badge--warn">operador</span>`;
      const fecha = u.createdAt ? new Date(u.createdAt).toLocaleDateString("es-MX") : "—";
      const delBtn = isSelf
        ? `<span class="muted" title="Tu propio usuario">—</span>`
        : `<button class="btn-icon btn-icon--danger" data-uaction="del" data-user="${escapeHtml(u.username)}" title="Eliminar usuario"><span class="ico">\u{1F5D1}</span><span class="btn-icon__label"> Eliminar</span></button>`;
      return `
        <tr>
          <td class="col-email" data-label="Usuario">${escapeHtml(u.username)}${isSelf ? ' <span class="muted">(tú)</span>' : ""}</td>
          <td data-label="Rol">${roleBadge}</td>
          <td data-label="Creado">${escapeHtml(fecha)}</td>
          <td class="col-actions" data-label="Acciones">
            <div class="actions">
              <button class="btn-icon" data-uaction="pwd" data-user="${escapeHtml(u.username)}" title="Cambiar contraseña"><span class="ico">\u{1F511}</span><span class="btn-icon__label"> Contraseña</span></button>
              ${delBtn}
            </div>
          </td>
        </tr>`;
    }).join("") || `<tr><td colspan="4" class="muted">Sin usuarios.</td></tr>`;
  }

  $("#usersTbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-uaction]");
    if (!btn) return;
    const user = btn.dataset.user;
    if (btn.dataset.uaction === "pwd") openUserPwdModal(user);
    else if (btn.dataset.uaction === "del") deleteUser(user);
  });

  // Crear usuario
  $("#newUserBtn").addEventListener("click", () => {
    $("#newUserName").value = "";
    $("#newUserRole").value = "operador";
    $("#newUserPwd").value = genPassword();
    $("#userCreateError").textContent = "";
    openModal("#userCreateModal");
    setTimeout(() => $("#newUserName").focus(), 50);
  });
  $("#userGenPwd").addEventListener("click", () => { $("#newUserPwd").value = genPassword(); });
  $("#userCreateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#userCreateError").textContent = "";
    const username = $("#newUserName").value.trim();
    const role = $("#newUserRole").value;
    const password = $("#newUserPwd").value;
    const { res, data } = await api(`${API}/users`, {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
    if (res.ok) {
      closeModal("#userCreateModal");
      flash(`Usuario ${username} (${role}) creado. Contraseña: ${password}`, "ok");
      loadUsers();
    } else {
      $("#userCreateError").textContent = msg(data.error);
    }
  });

  // Cambiar contraseña de usuario
  function openUserPwdModal(username) {
    $("#userPwdName").textContent = username;
    $("#userPwdNew").value = genPassword();
    $("#userPwdError").textContent = "";
    $("#userPwdForm").dataset.user = username;
    openModal("#userPwdModal");
  }
  $("#userPwdGen").addEventListener("click", () => { $("#userPwdNew").value = genPassword(); });
  $("#userPwdForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#userPwdError").textContent = "";
    const username = $("#userPwdForm").dataset.user;
    const password = $("#userPwdNew").value;
    const { res, data } = await api(`${API}/users/${encodeURIComponent(username)}/password`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      closeModal("#userPwdModal");
      flash(`Contraseña de ${username} actualizada. Nueva: ${password}`, "ok");
    } else {
      $("#userPwdError").textContent = msg(data.error);
    }
  });

  // Eliminar usuario
  async function deleteUser(username) {
    if (!confirm(`¿Eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)) return;
    const { res, data } = await api(`${API}/users/${encodeURIComponent(username)}`, { method: "DELETE" });
    if (res.ok) {
      flash(`Usuario ${username} eliminado.`, "ok");
      loadUsers();
    } else {
      flash(msg(data.error), "err");
    }
  }

  // ──────────── Init ────────────
  checkAuth();
})();

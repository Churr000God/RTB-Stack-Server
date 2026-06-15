// routes/serverOpsRoutes.js
// Panel de servidor: métricas del host, estado/logs/control de contenedores,
// PM2 y fail2ban. Montado en /api/admin/system.
//
//   Lecturas  (GET)  → requireAuth  (admin y operador)
//   Escrituras(POST) → requireAdmin (solo rol admin)
"use strict";

const express = require("express");
const { spawn } = require("child_process");

const requireAuth  = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");
const { runDocker, sendError } = require("../utils/mailExec");
const { appendAudit } = require("../utils/auditLog");
const {
  CONTAINERS,
  isAllowedContainer,
  isAllowedPm2,
  isAllowedAction,
  isValidJailName,
  isValidIp,
  runCmd,
  parseDockerPs,
  parsePm2,
  parseFail2banJailList,
  parseFail2banJail,
  readHostStats,
} = require("../utils/systemExec");

const router = express.Router();

// ──────────── Métricas del host ────────────────────────────────────────────
router.get("/host", requireAuth, async (req, res) => {
  try {
    const stats = await readHostStats();
    res.json(stats);
  } catch (err) {
    sendError(res, 500, "fallo_host", err);
  }
});

// ──────────── Estado de todos los contenedores ─────────────────────────────
router.get("/containers", requireAuth, async (req, res) => {
  try {
    // Lista de contenedores (incluye parados)
    const { stdout: psOut } = await runDocker(
      ["ps", "-a", "--format", "{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}"],
      { timeout: 10000 }
    );
    const psRows = parseDockerPs(psOut);
    const psMap  = new Map(psRows.map(r => [r.name, r]));

    // Stats de CPU/RAM — solo contenedores en ejecución; puede devolver vacío
    const statsMap = new Map();
    try {
      const { stdout: stOut } = await runDocker(
        ["stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}"],
        { timeout: 12000 }
      );
      for (const line of stOut.trim().split("\n").filter(Boolean)) {
        const [name, cpu, mem, memPct] = line.split("|");
        if (name) statsMap.set(name.trim(), {
          cpu:    (cpu    || "—").trim(),
          mem:    (mem    || "—").trim(),
          memPct: (memPct || "—").trim(),
        });
      }
    } catch (_) {
      // stats falla si ningún contenedor corre; seguimos con statsMap vacío
    }

    // Respuesta basada en la allowlist: siempre devolvemos los 8 contenedores
    const containers = CONTAINERS.map(name => {
      const ps = psMap.get(name);
      const st = statsMap.get(name);
      if (!ps) {
        return { name, state: "no_encontrado", statusStr: "—", image: "—", cpu: "—", mem: "—", memPct: "—" };
      }
      return {
        name,
        state:     ps.state,
        statusStr: ps.statusStr,
        image:     ps.image,
        cpu:    st ? st.cpu    : "—",
        mem:    st ? st.mem    : "—",
        memPct: st ? st.memPct : "—",
      };
    });

    res.json({ containers });
  } catch (err) {
    sendError(res, 500, "fallo_containers", err);
  }
});

// ──────────── Logs de un contenedor — tail ─────────────────────────────────
router.get("/containers/:name/logs", requireAuth, async (req, res) => {
  const { name } = req.params;
  if (!isAllowedContainer(name)) return res.status(400).json({ error: "contenedor_no_permitido" });

  const lines = Math.min(Math.max(parseInt(req.query.lines, 10) || 200, 1), 1000);
  try {
    const { stdout, stderr } = await runDocker(
      ["logs", "--tail", String(lines), name],
      { timeout: 12000, maxBuffer: 4 * 1024 * 1024 }
    );
    // mailserver escribe la mayoría de sus logs a stderr; concatenamos ambos
    res.type("text/plain").send((stderr || "") + (stdout || "") || "(sin logs)");
  } catch (err) {
    sendError(res, 500, "fallo_logs", err);
  }
});

// ──────────── Logs en vivo — Server-Sent Events ────────────────────────────
// El cliente abre un EventSource; cada línea de docker logs -f se envía
// como un evento SSE con JSON: { tipo, linea|mensaje }.
// La sesión se verifica antes de establecer el stream.
router.get("/containers/:name/logs/stream", requireAuth, (req, res) => {
  const { name } = req.params;
  if (!isAllowedContainer(name)) {
    return res.status(400).json({ error: "contenedor_no_permitido" });
  }

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();

  const send = (obj) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  send({ tipo: "inicio", contenedor: name });

  const child = spawn("docker", ["logs", "-f", "--tail", "100", name]);

  const onData = (chunk) => {
    for (const linea of chunk.toString().split("\n")) {
      if (linea) send({ tipo: "log", linea });
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData); // mailserver → logs en stderr

  child.on("error", (err) => {
    console.error(`[api] fallo_stream_logs — ${err.message}`);
    send({ tipo: "error", mensaje: "No se pudo abrir el stream de logs." });
    if (!res.writableEnded) res.end();
  });
  child.on("close", () => {
    send({ tipo: "fin" });
    if (!res.writableEnded) res.end();
  });

  // Si el cliente cierra la pestaña / cambia de sección → matar el proceso
  res.on("close", () => {
    if (!child.killed) child.kill("SIGKILL");
  });
});

// ──────────── Estado de PM2 ────────────────────────────────────────────────
router.get("/pm2", requireAuth, async (req, res) => {
  try {
    const { stdout } = await runCmd("pm2", ["jlist"], { timeout: 8000 });
    const procs = parsePm2(stdout).map(p => {
      // Calcular uptime legible a partir del timestamp de inicio
      const now = Date.now();
      const uptimeSecs = p.pmUptime ? Math.floor((now - p.pmUptime) / 1000) : 0;
      const d = Math.floor(uptimeSecs / 86400);
      const h = Math.floor((uptimeSecs % 86400) / 3600);
      const m = Math.floor((uptimeSecs % 3600)  / 60);
      const uptimeStr = p.status === "online" && uptimeSecs > 0
        ? (d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`)
        : "—";
      const memMB = (p.memory && p.memory > 0)
        ? (p.memory / 1024 / 1024).toFixed(1) + " MB"
        : "—";
      const cpuStr = (p.cpu !== null && p.cpu !== undefined)
        ? p.cpu.toFixed(1) + "%"
        : "—";
      return { ...p, uptimeStr, memMB, cpuStr };
    });
    res.json({ procs });
  } catch (err) {
    sendError(res, 500, "fallo_pm2", err);
  }
});

// ──────────── Estado de fail2ban ───────────────────────────────────────────
// fail2ban corre dentro del contenedor mailserver.
router.get("/fail2ban", requireAuth, async (req, res) => {
  try {
    const { stdout: statusOut } = await runDocker(
      ["exec", "mailserver", "fail2ban-client", "status"],
      { timeout: 8000 }
    );
    const jailNames = parseFail2banJailList(statusOut);

    const jails = await Promise.all(jailNames.map(async (jail) => {
      try {
        const { stdout: jailOut } = await runDocker(
          ["exec", "mailserver", "fail2ban-client", "status", jail],
          { timeout: 8000 }
        );
        return parseFail2banJail(jail, jailOut);
      } catch (_) {
        return { jail, error: "no_disponible", failed: 0, banned: 0, totalBanned: 0, ips: [] };
      }
    }));

    res.json({ disponible: true, jails });
  } catch (err) {
    // fail2ban no responde o mailserver está caído
    res.json({ disponible: false });
  }
});

// ──────────── Administración de fail2ban — solo admin ──────────────────────
// POST /fail2ban/:jail/:action   (action: ban | unban)   body: { ip }
// Doble validación: formato del nombre de jail + existencia en el listado vivo.
router.post("/fail2ban/:jail/:action", requireAdmin, async (req, res) => {
  const { jail, action } = req.params;
  const ip = (req.body || {}).ip;

  if (!isValidJailName(jail))             return res.status(400).json({ error: "jail_invalida" });
  if (action !== "ban" && action !== "unban") return res.status(400).json({ error: "accion_invalida" });
  if (!isValidIp(ip))                     return res.status(400).json({ error: "ip_invalida" });

  try {
    const { stdout } = await runDocker(
      ["exec", "mailserver", "fail2ban-client", "status"],
      { timeout: 8000 }
    );
    if (!parseFail2banJailList(stdout).includes(jail)) {
      return res.status(400).json({ error: "jail_invalida" });
    }

    const cmd = action === "ban" ? "banip" : "unbanip";
    await runDocker(
      ["exec", "mailserver", "fail2ban-client", "set", jail, cmd, ip],
      { timeout: 8000 }
    );
    appendAudit({ admin: req.session.user, action: `f2b_${action}`, target: ip, details: `jail=${jail}` });
    res.json({ ok: true, jail, ip, accion: action });
  } catch (err) {
    // Desbanear una IP que ya no está baneada no es un error operativo.
    if (action === "unban" && /not banned/i.test(err.stderr || "")) {
      return res.json({ ok: true, jail, ip, accion: action, nota: "no_estaba_baneada" });
    }
    sendError(res, 500, `fallo_${action}`, err);
  }
});

// ──────────── Control de contenedores — solo admin ─────────────────────────
// POST /containers/:name/:action   (start | stop | restart)
router.post("/containers/:name/:action", requireAdmin, async (req, res) => {
  const { name, action } = req.params;

  if (!isAllowedContainer(name)) return res.status(400).json({ error: "contenedor_no_permitido" });
  if (!isAllowedAction(action))  return res.status(400).json({ error: "accion_invalida" });

  const timeouts = { start: 25000, stop: 35000, restart: 35000 };

  try {
    await runDocker([action, name], { timeout: timeouts[action] });
    appendAudit({ admin: req.session.user || "admin", action: `docker_${action}`, target: name });

    // Breve pausa para que Docker actualice el estado interno
    await new Promise(r => setTimeout(r, 800));

    // Devolver el estado actualizado
    let state = "desconocido";
    try {
      const { stdout } = await runDocker(
        ["inspect", "-f", "{{.State.Status}}", name],
        { timeout: 5000 }
      );
      state = stdout.trim();
    } catch (_) {}

    res.json({ ok: true, accion: action, contenedor: name, state });
  } catch (err) {
    sendError(res, 500, `fallo_${action}`, err);
  }
});

// ──────────── Reinicio de PM2 — solo admin ────────────────────────────────
// Solo restart (no stop): detener el backend se auto-cortaría.
router.post("/pm2/:proc/restart", requireAdmin, async (req, res) => {
  const { proc } = req.params;
  if (!isAllowedPm2(proc)) return res.status(400).json({ error: "proceso_no_permitido" });

  appendAudit({ admin: req.session.user || "admin", action: "pm2_restart", target: proc });

  // Respondemos ANTES de que PM2 mate el proceso para que la respuesta llegue al cliente
  res.status(202).json({
    ok: true,
    mensaje: "Reiniciando el backend. El panel se reconectará en unos segundos.",
  });

  // Delay de seguridad: la respuesta HTTP debe haberse enviado antes del restart
  setTimeout(() => {
    runCmd("pm2", ["restart", proc], { timeout: 20000 }).catch(() => {});
  }, 600);
});

module.exports = router;

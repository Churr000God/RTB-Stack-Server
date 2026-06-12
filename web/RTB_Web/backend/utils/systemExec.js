// utils/systemExec.js
// Utilidades para monitoreo del sistema: ejecución sin shell, parsers puros
// y métricas del host. Usado por serverOpsRoutes.js.
"use strict";

const { execFile } = require("child_process");
const os  = require("os");
const fs  = require("fs");

// ── Allowlists de seguridad ──────────────────────────────────────────────────
// Solo se aceptan estos nombres en endpoints de control; cualquier otro → 400.
const CONTAINERS = [
  "rtb_web",
  "nextcloud",
  "postgres",
  "redis",
  "collabora",
  "roundcube",
  "portainer",
  "mailserver",
];

const PM2_PROCS = ["rtb_backend"];

const ALLOWED_CTL_ACTIONS = new Set(["start", "stop", "restart"]);

function isAllowedContainer(name) {
  return typeof name === "string" && CONTAINERS.includes(name);
}
function isAllowedPm2(name) {
  return typeof name === "string" && PM2_PROCS.includes(name);
}
function isAllowedAction(action) {
  return ALLOWED_CTL_ACTIONS.has(action);
}

// ── Wrapper execFile genérico (sin shell) ────────────────────────────────────
// Mismo shape que runDocker de mailExec.js.
function runCmd(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: opts.timeout || 15000, maxBuffer: opts.maxBuffer || 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = stderr;
          err.stdout = stdout;
          return reject(err);
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

// ── Parsers puros (testeables sin I/O) ──────────────────────────────────────

/**
 * Parsea salida de `df -B1 /`.
 * Maneja tanto la forma de una línea como la de dos (filesystem path largo).
 */
function parseDf(out) {
  const lines = out.trim().split("\n");
  // Línea 0 = encabezado → descartarla; unir el resto y limpiar espacios.
  const data  = lines.slice(1).join(" ").replace(/\s+/g, " ").trim();
  const parts = data.split(" ");
  // parts: [filesystem, 1B-blocks, used, available, use%, mount]
  const total  = parseInt(parts[1], 10) || 0;
  const used   = parseInt(parts[2], 10) || 0;
  const avail  = parseInt(parts[3], 10) || 0;
  const usePct = parseInt(parts[4], 10) || 0; // "40%" → 40
  return { total, used, available: avail, usePct };
}

/**
 * Parsea /proc/meminfo.
 * Valores en kB en la fuente, devueltos en bytes.
 */
function parseMeminfo(out) {
  const lines = out.split("\n");
  const get = (key) => {
    const line = lines.find(l => l.startsWith(key + ":"));
    if (!line) return 0;
    return parseInt(line.split(":")[1].trim(), 10) || 0;
  };
  const memTotal  = get("MemTotal")     * 1024;
  const memFree   = get("MemFree")      * 1024;
  const memAvail  = get("MemAvailable") * 1024;
  const swapTotal = get("SwapTotal")    * 1024;
  const swapFree  = get("SwapFree")     * 1024;
  return {
    memTotal,
    memFree,
    memAvailable: memAvail,
    swapTotal,
    swapFree,
    swapUsed: swapTotal - swapFree,
  };
}

/**
 * Parsea salida de `pm2 jlist` (JSON).
 * Filtra solo los procesos en PM2_PROCS.
 */
function parsePm2(jlistJson) {
  let list;
  try   { list = JSON.parse(jlistJson); }
  catch (_) { return []; }
  if (!Array.isArray(list)) return [];
  return list
    .filter(p => PM2_PROCS.includes(p.name))
    .map(p => ({
      name:     p.name,
      status:   (p.pm2_env && p.pm2_env.status) || "unknown",
      pid:      p.pid || null,
      cpu:      p.monit ? p.monit.cpu   : null,
      memory:   p.monit ? p.monit.memory : null,
      pmUptime: (p.pm2_env && p.pm2_env.pm_uptime) || null,
      restarts: (p.pm2_env && p.pm2_env.restart_time) || 0,
    }));
}

/**
 * Parsea salida de:
 *   docker ps -a --format '{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}'
 */
function parseDockerPs(out) {
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const parts = line.split("|");
      return {
        name:      (parts[0] || "").trim(),
        state:     (parts[1] || "").trim(),
        statusStr: (parts[2] || "").trim(),
        image:     (parts[3] || "").trim(),
      };
    });
}

/**
 * Parsea la lista de jails de `fail2ban-client status`.
 * Devuelve array de nombres de jail.
 */
function parseFail2banJailList(out) {
  const match = out.match(/Jail list:\s*([^\n]*)/i);
  if (!match) return [];
  return match[1].split(",").map(j => j.trim()).filter(Boolean);
}

/**
 * Parsea la salida de `fail2ban-client status <jail>`.
 * Devuelve { jail, failed, banned, totalBanned, ips }.
 */
function parseFail2banJail(jailName, out) {
  const getNum = (label) => {
    const m = out.match(new RegExp(label + ":\\s*(\\d+)"));
    return m ? parseInt(m[1], 10) : 0;
  };
  const ipMatch = out.match(/Banned IP list:\s*([^\n]*)/i);
  const ips = ipMatch ? ipMatch[1].trim().split(/\s+/).filter(Boolean) : [];
  return {
    jail:        jailName,
    failed:      getNum("Currently failed"),
    banned:      getNum("Currently banned"),
    totalBanned: getNum("Total banned"),
    ips,
  };
}

// ── Formateo de bytes ────────────────────────────────────────────────────────
function bytesToHuman(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

// ── Métricas del host ────────────────────────────────────────────────────────
async function readHostStats() {
  const cpus        = os.cpus();
  const [load1, load5, load15] = os.loadavg();
  const totalMem    = os.totalmem();
  const freeMem     = os.freemem();
  const usedMem     = totalMem - freeMem;
  const uptimeSecs  = os.uptime();

  // Disco: `df -B1 /`
  let disk = { total: 0, used: 0, available: 0, usePct: 0 };
  try {
    const { stdout } = await runCmd("df", ["-B1", "/"], { timeout: 5000 });
    disk = parseDf(stdout);
  } catch (_) { /* tolerar — puede fallar en entornos restringidos */ }

  // Swap: /proc/meminfo (disponible sin sudo en Linux)
  let swap = { swapTotal: 0, swapFree: 0, swapUsed: 0 };
  try {
    const content = fs.readFileSync("/proc/meminfo", "utf8");
    const mi = parseMeminfo(content);
    swap = { swapTotal: mi.swapTotal, swapFree: mi.swapFree, swapUsed: mi.swapUsed };
  } catch (_) { /* tolerar */ }

  const memPct  = totalMem    ? Math.round((usedMem        / totalMem)        * 100) : 0;
  const swapPct = swap.swapTotal ? Math.round((swap.swapUsed / swap.swapTotal) * 100) : 0;

  // Uptime legible
  const d = Math.floor(uptimeSecs / 86400);
  const h = Math.floor((uptimeSecs % 86400) / 3600);
  const m = Math.floor((uptimeSecs % 3600)  / 60);
  const uptimeStr = d > 0
    ? `${d}d ${h}h ${m}m`
    : h > 0
    ? `${h}h ${m}m`
    : `${m}m`;

  return {
    cpuCores:  cpus.length,
    cpuModel:  cpus[0] ? cpus[0].model.trim() : "—",
    load1:     load1.toFixed(2),
    load5:     load5.toFixed(2),
    load15:    load15.toFixed(2),
    memTotal:  bytesToHuman(totalMem),
    memUsed:   bytesToHuman(usedMem),
    memFree:   bytesToHuman(freeMem),
    memPct,
    diskTotal: bytesToHuman(disk.total),
    diskUsed:  bytesToHuman(disk.used),
    diskFree:  bytesToHuman(disk.available),
    diskPct:   disk.usePct,
    swapTotal: bytesToHuman(swap.swapTotal),
    swapUsed:  bytesToHuman(swap.swapUsed),
    swapFree:  bytesToHuman(swap.swapFree),
    swapPct,
    swapWarning: swap.swapTotal === 0,  // caso real: este servidor tiene 0 swap
    uptime:    uptimeStr,
    uptimeSecs,
  };
}

module.exports = {
  CONTAINERS,
  PM2_PROCS,
  ALLOWED_CTL_ACTIONS,
  isAllowedContainer,
  isAllowedPm2,
  isAllowedAction,
  runCmd,
  parseDf,
  parseMeminfo,
  parsePm2,
  parseDockerPs,
  parseFail2banJailList,
  parseFail2banJail,
  bytesToHuman,
  readHostStats,
};

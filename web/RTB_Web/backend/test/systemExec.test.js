// test/systemExec.test.js
// Pruebas unitarias para los parsers de systemExec.js.
// Ejecutar con: node test/systemExec.test.js
"use strict";

const assert = require("assert");
const {
  parseDf,
  parseMeminfo,
  parsePm2,
  parseDockerPs,
  parseFail2banJailList,
  parseFail2banJail,
} = require("../utils/systemExec");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── parseDf ──────────────────────────────────────────────────────────────────
console.log("\nparseDf");

test("salida normal (línea única)", () => {
  const out = [
    "Filesystem     1B-blocks         Used   Available Use% Mounted on",
    "/dev/sda1      53687091200  21474836480  32212254720  40% /",
  ].join("\n");
  const r = parseDf(out);
  assert.strictEqual(r.total,     53687091200);
  assert.strictEqual(r.used,      21474836480);
  assert.strictEqual(r.available, 32212254720);
  assert.strictEqual(r.usePct,    40);
});

test("path largo — df parte en dos líneas", () => {
  const out = [
    "Filesystem     1B-blocks         Used   Available Use% Mounted on",
    "/dev/mapper/ubuntu--vg-ubuntu--lv",
    "               53687091200  10000000000  43687091200  19% /",
  ].join("\n");
  const r = parseDf(out);
  assert.strictEqual(r.total,  53687091200);
  assert.strictEqual(r.used,   10000000000);
  assert.strictEqual(r.usePct, 19);
});

test("devuelve zeros en salida vacía (no lanza)", () => {
  const r = parseDf("Filesystem 1B-blocks Used Available Use% Mounted\n");
  assert.ok(typeof r.total   === "number");
  assert.ok(typeof r.usePct  === "number");
});

// ── parseMeminfo ─────────────────────────────────────────────────────────────
console.log("\nparseMeminfo");

test("swap=0 — caso real del servidor RTB (sin swap)", () => {
  const out = [
    "MemTotal:       16384000 kB",
    "MemFree:         5000000 kB",
    "MemAvailable:    8000000 kB",
    "SwapCached:            0 kB",
    "SwapTotal:             0 kB",
    "SwapFree:              0 kB",
  ].join("\n");
  const r = parseMeminfo(out);
  assert.strictEqual(r.memTotal,  16384000 * 1024);
  assert.strictEqual(r.swapTotal, 0);
  assert.strictEqual(r.swapFree,  0);
  assert.strictEqual(r.swapUsed,  0);
});

test("con swap configurado", () => {
  const out = [
    "MemTotal:       16384000 kB",
    "MemFree:         5000000 kB",
    "MemAvailable:    8000000 kB",
    "SwapTotal:       4000000 kB",
    "SwapFree:        3000000 kB",
  ].join("\n");
  const r = parseMeminfo(out);
  assert.strictEqual(r.swapTotal, 4000000 * 1024);
  assert.strictEqual(r.swapFree,  3000000 * 1024);
  assert.strictEqual(r.swapUsed,  1000000 * 1024);
});

test("campo faltante devuelve 0", () => {
  const r = parseMeminfo("MemTotal: 8192000 kB\n");
  assert.strictEqual(r.swapTotal, 0);
  assert.strictEqual(r.memFree,   0);
});

// ── parsePm2 ─────────────────────────────────────────────────────────────────
console.log("\nparsePm2");

test("proceso online", () => {
  const jlist = JSON.stringify([
    {
      name: "rtb_backend",
      pid:  1234,
      pm2_env: { status: "online", pm_uptime: 1710000000000, restart_time: 2 },
      monit:   { cpu: 0.5, memory: 52428800 },
    },
  ]);
  const r = parsePm2(jlist);
  assert.strictEqual(r.length,       1);
  assert.strictEqual(r[0].name,      "rtb_backend");
  assert.strictEqual(r[0].status,    "online");
  assert.strictEqual(r[0].restarts,  2);
  assert.strictEqual(r[0].memory,    52428800);
  assert.strictEqual(r[0].cpu,       0.5);
});

test("proceso parado (stopped)", () => {
  const jlist = JSON.stringify([
    {
      name: "rtb_backend",
      pid:  null,
      pm2_env: { status: "stopped", pm_uptime: null, restart_time: 5 },
      monit:   { cpu: 0, memory: 0 },
    },
  ]);
  const r = parsePm2(jlist);
  assert.strictEqual(r[0].status,   "stopped");
  assert.strictEqual(r[0].pid,      null);
  assert.strictEqual(r[0].restarts, 5);
});

test("proceso no permitido (allowlist) es ignorado", () => {
  const jlist = JSON.stringify([
    { name: "otro_proceso", pid: 9, pm2_env: { status: "online", restart_time: 0 }, monit: { cpu: 0, memory: 0 } },
  ]);
  assert.deepStrictEqual(parsePm2(jlist), []);
});

test("JSON inválido devuelve []", () => {
  assert.deepStrictEqual(parsePm2("not json at all"), []);
});

test("array vacío devuelve []", () => {
  assert.deepStrictEqual(parsePm2("[]"), []);
});

// ── parseDockerPs ─────────────────────────────────────────────────────────────
console.log("\nparseDockerPs");

test("varios contenedores (running y exited)", () => {
  const out = [
    "rtb_web|running|Up 2 hours|nginx:1",
    "nextcloud|running|Up 2 hours (healthy)|nextcloud:31",
    "postgres|exited|Exited (1) 5 minutes ago|postgres:15",
    "mailserver|running|Up 2 hours|mailserver/docker-mailserver:latest",
  ].join("\n");
  const r = parseDockerPs(out);
  assert.strictEqual(r.length,       4);
  assert.strictEqual(r[0].name,      "rtb_web");
  assert.strictEqual(r[0].state,     "running");
  assert.strictEqual(r[2].name,      "postgres");
  assert.strictEqual(r[2].state,     "exited");
  assert.ok(r[2].statusStr.includes("Exited"));
});

test("contenedor detenido — campo image disponible", () => {
  const out = "redis|exited|Exited (0) 3 min ago|redis:alpine";
  const r = parseDockerPs(out);
  assert.strictEqual(r[0].state, "exited");
  assert.strictEqual(r[0].image, "redis:alpine");
});

test("salida vacía devuelve []", () => {
  assert.deepStrictEqual(parseDockerPs(""), []);
  assert.deepStrictEqual(parseDockerPs("\n\n"), []);
});

// ── parseFail2banJailList ─────────────────────────────────────────────────────
console.log("\nparseFail2banJailList");

test("lista con varios jails", () => {
  const out = [
    "Status",
    "|- Number of jail:\t3",
    "`- Jail list:\tsshd, postfix, dovecot-auth",
  ].join("\n");
  assert.deepStrictEqual(parseFail2banJailList(out), ["sshd", "postfix", "dovecot-auth"]);
});

test("un solo jail", () => {
  const out = "Status\n`- Jail list:\tsshd";
  assert.deepStrictEqual(parseFail2banJailList(out), ["sshd"]);
});

test("cero jails (lista vacía)", () => {
  const out = "Status\n|- Number of jail:\t0\n`- Jail list:\t";
  assert.deepStrictEqual(parseFail2banJailList(out), []);
});

test("sin línea Jail list", () => {
  assert.deepStrictEqual(parseFail2banJailList("Status\nSin jails"), []);
});

// ── parseFail2banJail ─────────────────────────────────────────────────────────
console.log("\nparseFail2banJail");

test("jail con IPs baneadas", () => {
  const out = [
    "Status for the jail: sshd",
    "|- Filter",
    "|  |- Currently failed:\t2",
    "|  |- Total failed:\t156",
    "`- Actions",
    "   |- Currently banned:\t3",
    "   |- Total banned:\t47",
    "   `- Banned IP list:\t1.2.3.4 5.6.7.8 9.10.11.12",
  ].join("\n");
  const r = parseFail2banJail("sshd", out);
  assert.strictEqual(r.jail,        "sshd");
  assert.strictEqual(r.failed,      2);
  assert.strictEqual(r.banned,      3);
  assert.strictEqual(r.totalBanned, 47);
  assert.deepStrictEqual(r.ips, ["1.2.3.4", "5.6.7.8", "9.10.11.12"]);
});

test("jail sin IPs baneadas", () => {
  const out = [
    "Status for the jail: postfix",
    "|  |- Currently failed:\t0",
    "   |- Currently banned:\t0",
    "   |- Total banned:\t0",
    "   `- Banned IP list:\t",
  ].join("\n");
  const r = parseFail2banJail("postfix", out);
  assert.strictEqual(r.banned, 0);
  assert.deepStrictEqual(r.ips, []);
});

test("jail name se preserva aunque la salida esté vacía", () => {
  const r = parseFail2banJail("dovecot", "");
  assert.strictEqual(r.jail,   "dovecot");
  assert.strictEqual(r.failed, 0);
  assert.deepStrictEqual(r.ips, []);
});

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(54)}`);
console.log(`Resultado: ${passed} pasados, ${failed} fallidos`);
if (failed > 0) process.exitCode = 1;

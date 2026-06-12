// test/mailExec.test.js
// Pruebas unitarias para la validación de entrada de mailExec.js.
// Ejecutar con: node test/mailExec.test.js
"use strict";

const assert = require("assert");
const {
  validateEmail,
  validateDomain,
  validateQuota,
  parseAccounts,
} = require("../utils/mailExec");

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

// ── validateEmail ────────────────────────────────────────────────────────────
console.log("\nvalidateEmail");

test("email válido pasa", () => {
  assert.strictEqual(validateEmail("ventas@refacrtb.com.mx"), null);
});

test("email con punto interno en local pasa", () => {
  assert.strictEqual(validateEmail("juan.perez@refacrtb.com.mx"), null);
});

test("email con guion y guion bajo pasa", () => {
  assert.strictEqual(validateEmail("a_b-c@refacrtb.com.mx"), null);
});

test("vacío / no string rechazado", () => {
  assert.strictEqual(validateEmail(""), "email_requerido");
  assert.strictEqual(validateEmail(null), "email_requerido");
  assert.strictEqual(validateEmail(42), "email_requerido");
});

test("sin arroba rechazado", () => {
  assert.strictEqual(validateEmail("ventasrefacrtb.com.mx"), "email_invalido");
});

test("local '..' (traversal) rechazado", () => {
  assert.strictEqual(validateEmail("..@refacrtb.com.mx"), "email_invalido");
});

test("local con '..' interno rechazado", () => {
  assert.strictEqual(validateEmail("a..b@refacrtb.com.mx"), "email_invalido");
});

test("local que inicia con punto rechazado", () => {
  assert.strictEqual(validateEmail(".foo@refacrtb.com.mx"), "email_invalido");
});

test("local que termina con punto rechazado", () => {
  assert.strictEqual(validateEmail("foo.@refacrtb.com.mx"), "email_invalido");
});

test("dominio con '..' rechazado", () => {
  assert.strictEqual(validateEmail("foo@a..com"), "email_invalido");
});

test("dominio que inicia con punto rechazado", () => {
  assert.strictEqual(validateEmail("foo@.refacrtb.com.mx"), "email_invalido");
});

test("email demasiado largo rechazado", () => {
  const long = "a".repeat(250) + "@b.mx";
  assert.strictEqual(validateEmail(long), "email_demasiado_largo");
});

// ── validateDomain ───────────────────────────────────────────────────────────
console.log("\nvalidateDomain");

test("dominio válido pasa", () => {
  assert.strictEqual(validateDomain("refacrtb.com.mx"), null);
});

test("subdominio válido pasa", () => {
  assert.strictEqual(validateDomain("mail.refacrtb.com.mx"), null);
});

test("vacío / no string rechazado", () => {
  assert.strictEqual(validateDomain(""), "dominio_requerido");
  assert.strictEqual(validateDomain(undefined), "dominio_requerido");
});

test("'..' (traversal) rechazado", () => {
  assert.strictEqual(validateDomain("a..com"), "dominio_invalido");
});

test("punto inicial rechazado", () => {
  assert.strictEqual(validateDomain(".refacrtb.com.mx"), "dominio_invalido");
});

test("punto final rechazado", () => {
  assert.strictEqual(validateDomain("refacrtb.com.mx."), "dominio_invalido");
});

test("guion inicial en etiqueta rechazado", () => {
  assert.strictEqual(validateDomain("-mal.com"), "dominio_invalido");
});

test("sin TLD rechazado", () => {
  assert.strictEqual(validateDomain("localhost"), "dominio_invalido");
});

// ── validateQuota (regresión: comportamiento existente) ──────────────────────
console.log("\nvalidateQuota");

test("vacío / 0 = sin límite", () => {
  assert.strictEqual(validateQuota(""), null);
  assert.strictEqual(validateQuota("0"), null);
  assert.strictEqual(validateQuota(null), null);
});

test("formatos válidos", () => {
  assert.strictEqual(validateQuota("5G"), null);
  assert.strictEqual(validateQuota("500M"), null);
  assert.strictEqual(validateQuota("100k"), null);
});

test("formatos inválidos", () => {
  assert.strictEqual(validateQuota("5GB"), "cuota_invalida");
  assert.strictEqual(validateQuota("abc"), "cuota_invalida");
  assert.strictEqual(validateQuota("-5G"), "cuota_invalida");
});

// ── parseAccounts (regresión: comportamiento existente) ──────────────────────
console.log("\nparseAccounts");

test("salida normal de setup email list", () => {
  const out = [
    "* info@refacrtb.com.mx ( 1.8G / 5G ) [36%]",
    "* ventas@refacrtb.com.mx ( 33M / ~ ) [0%]",
  ].join("\n");
  const r = parseAccounts(out);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].email, "info@refacrtb.com.mx");
  assert.strictEqual(r[0].porcentaje, 36);
  assert.strictEqual(r[1].cuota, "ilimitada");
});

test("cuenta recién creada con campos vacíos", () => {
  const r = parseAccounts("* nuevo@refacrtb.com.mx (  /  ) [%]");
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].usado, "—");
  assert.strictEqual(r[0].porcentaje, 0);
});

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(54)}`);
console.log(`Resultado: ${passed} pasados, ${failed} fallidos`);
if (failed > 0) process.exitCode = 1;

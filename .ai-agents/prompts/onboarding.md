# Prompt de onboarding (incorporación a proyecto en marcha)

Guardado el 2026-06-09. Es el prompt usado para que un agente se incorpore al proyecto RTB:
primero entiende (solo lectura), luego configura la estructura estándar sin pisar lo existente,
al final propone un plan. No asume la arquitectura: la confirma leyendo contexto + grafo.

## Reglas (no negociables)

- Fase de descubrimiento y lectura = **solo lectura**. No modifica código de la app.
- No sobrescribir archivos de contexto existentes; si falta una pieza estándar, crearla; si
  existe e incompleta, **complementar** sin borrar.
- Antes de correr algo que cambie estado o reinicie un servicio → **preguntar primero**.

## Pasos

1. **Inventario** de la estructura estándar: `CLAUDE.md`, `AGENTS.md`,
   `.claude/settings.local.json`, `.ai-agents/{prompts,errors/ERROR_LOG.md,learning/SESSION_LOG.md}`,
   `contexto/`, `estructura_proyecto/`, `diseno_paginas/`, `graphify-out/`, memoria persistente.
2. **Mapear el código con Graphify** antes de leer a ciegas:
   `graphify install --project --platform claude`, añadir `graphify-out/` a `.gitignore`,
   generar el grafo. Identificar god nodes, dependencias y módulos.
3. **Leer contexto en orden:** CLAUDE.md → AGENTS.md → `contexto/` (dominio = fuente de verdad)
   → `estructura_proyecto/` → grafo → `diseno_paginas/`.
4. **Aprender de errores/sesiones:** `errors/ERROR_LOG.md`, `learning/SESSION_LOG.md`, memoria.
5. **Completar gaps** de la estructura sin pisar lo existente.
6. **Permisos base** en `.claude/settings.local.json` (agregar solo los que falten).
7. **Resumen + plan** antes de tocar código. No empezar a modificar hasta aprobación.

## Skills por tarea

`test-driven-development` (antes de parseo/agregaciones/KPIs) · `code-review` (>1 módulo o KPIs)
· `verify`/`run` (validar) · `verification-before-completion` (antes de cerrar) ·
`security-review` (antes de merge a main) · `deep-research` (incertidumbre técnica).

## Notas de la primera ejecución (2026-06-09)

- `graphify` 0.8.36 (pipx) instalado por el usuario. `detect` sobre `.` se cuelga por
  `node_modules/` + dirs de datos → el grafo se construyó AST-only sobre las carpetas de fuente.
- Alcance acordado: solo onboarding (sin tarea de código posterior aún).

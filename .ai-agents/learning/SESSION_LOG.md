# SESSION_LOG — RTB

Bitácora de sesiones de trabajo con agentes. Lo más reciente arriba. Cada entrada: qué se hizo,
en qué estado quedó, y qué sigue.

---

## 2026-06-09 — Onboarding e instalación de estructura estándar

**Objetivo:** incorporación al proyecto. Inventariar, mapear el código con grafo, e inicializar
la estructura estándar de trabajo con agentes sin pisar lo existente. **No se modificó código
de la aplicación.**

**Hecho:**
- Inventario de estructura: faltaba casi todo (`CLAUDE.md`, `AGENTS.md`, `.ai-agents/`,
  `contexto/`, `estructura_proyecto/`, `diseno_paginas/`, `MEMORY.md`, grafo). Existían:
  `.claude/settings.local.json` (47 permisos), docs propias (`ARQUITECTURA/OPERACIONES/MEJORAS/README`).
- Graphify 0.8.36 instalado (skill para claude, scope proyecto). Grafo AST-only generado sobre
  `web/RTB_Web/{backend,frontend}` + `api/` → `graphify-out/graph.json` (93 nodos, 97 aristas,
  16 comunidades). `graphify-out/` añadido a `.gitignore`.
- Hallazgos del grafo: el panel admin (`admin.js`) es el hub (god node `openModal()`, 7 aristas).
  Sin ciclos de importación. 39 nodos aislados (imports). Conexión "sorpresa": `api/main.py`
  `contact_form()` → `send_email()` (FastAPI sin uso).
- Creados: `CLAUDE.md` (complemento, preservando sección graphify), `AGENTS.md`,
  `.ai-agents/{prompts/onboarding.md, errors/ERROR_LOG.md, learning/SESSION_LOG.md}`,
  `contexto/`, `estructura_proyecto/`, `diseno_paginas/`, memoria persistente con `MEMORY.md`.
- `.claude/settings.local.json`: añadidos permisos base faltantes (python/pip/uv/docker compose/
  gh auth/chromium), sin duplicar los 47 existentes.

**Estado:** estructura estándar completa. Issues conocidos documentados en `ERROR_LOG.md`
(NO corregidos: fail2ban, api crash-loop, swap, secretos).

**Pendiente / siguiente:** definir la tarea de código siguiente. Candidatos discutidos:
(a) corregir issues conocidos, (b) seguir el panel admin de correo (tests/UI/seguridad).
Antes de cualquier cambio en correo/auth: `security-review` antes de merge a `main`.

# RTB — Refacciones Tomás Badillo

Servidor de **infraestructura en producción** (IONOS Madrid, `217.154.101.174`, Ubuntu 22.04)
que aloja varios servicios para `refacrtb.com.mx`. **No es una sola app**: es un conjunto de
contenedores Docker + un backend Node bajo PM2.

> Fuente de verdad detallada: `ARQUITECTURA.md`, `OPERACIONES.md`, `MEJORAS.md`, `README.md`
> (en la raíz). Este archivo es el resumen operativo para agentes. Para navegar el código,
> usa el grafo: `graphify query "<pregunta>"` (ver sección graphify abajo).

## Qué hay aquí

| Servicio | Stack | Dónde | Puerto |
|---|---|---|---|
| Sitio web público | HTML/CSS/JS vanilla | `web/RTB_Web/frontend/` | vía nginx 80/443 |
| **Dashboard de control de correo** (trabajo activo) | HTML/JS + Express | `frontend/admin/` + `backend/routes/{mailAdminRoutes,mailOpsRoutes,adminUsersRoutes,serverOpsRoutes}.js` | vía nginx → :3000 |
| API backend | Node.js/Express 5 (PM2) | `web/RTB_Web/backend/` | `localhost:3000` |
| Servidor de correo | docker-mailserver (Postfix/Dovecot) | `mailserver/` | 25/587/993 |
| Nextcloud + Collabora + Postgres | Docker | `docker/` + `nextcloud/`, `db/` | vía nginx |
| Reverse proxy / TLS | nginx (Let's Encrypt) | `docker/` (`rtb_web`) | 80/443 |

## Cómo se corre

```bash
# Backend Node (PM2)
cd web/RTB_Web/backend && pm2 start server.js --name rtb_backend   # ya corre en prod
pm2 logs rtb_backend
# Stack web (nginx, nextcloud, postgres, collabora)
cd docker && docker compose up -d
# Correo (compose aparte, red aislada)
cd mailserver && docker compose up -d
```

Backend escucha solo en `localhost:3000`; el acceso público pasa por nginx. Endpoints admin
bajo `/api/admin/*` (sesión con cookie httpOnly, bcrypt, rate-limit 5/15min).

## Reglas de trabajo (gotchas — leer antes de tocar)

- **Datos = intocables.** No edites ni borres `mailserver/mail-data/`, `mailserver/mail-state/`,
  `nextcloud/data/`, `db/data/`. Están en `.gitignore` por algo (correo real, ~8 GB).
- **Buzones se operan vía contenedor**, no a mano: `docker exec mailserver setup email|quota …`
  y `doveadm` para vaciar. El backend ya envuelve esto con `execFile` (sin shell) en
  `routes/mailAdminRoutes.js`. No tocar `postfix-accounts.cf` directamente.
- **graphify scan = solo código.** `node_modules/` y los dirs de datos son enormes; `detect`
  sobre `.` se cuelga. El grafo se construyó solo sobre `web/RTB_Web/{backend,frontend}` + `api/`.
- **No correr `detect` sobre la raíz completa.** Apunta a las carpetas de fuente.

## Issues conocidos (NO son bugs nuevos — ver `.ai-agents/errors/ERROR_LOG.md` y `MEJORAS.md`)

- `api_rtb` (FastAPI en `api/`) en **crash-loop**: bind mount `api/app` tapa los archivos de
  la imagen. Módulo **sin uso** — no lo "arregles" sin confirmar; quizá deba retirarse.
- **fail2ban**: ya usa `nftables-multiport` (resuelto 2026-06-11; antes allports baneaba todos
  los puertos). bantime 1h default, jail `custom` 180d. Ban/unban de IPs desde el panel
  (pestaña Servidor, solo admin) o CLI `docker exec mailserver fail2ban-client set <jail> unbanip <ip>`.
- **Secretos**: resuelto 2026-06-11 — `docker-compose.yml` usa `${VARS}` desde `docker/.env`
  (gitignored, 600). No reintroducir valores literales en el compose.
- **Swap**: resuelto 2026-06-11 — swapfile de 4 GB activo y en `/etc/fstab`.
- Dirs raíz vacíos placeholder: `admin/ finanzas/ logistica/ ventas/ nube/ app/` — ignóralos.

## Tests

Backend: `web/RTB_Web/backend/test/{systemExec,mailExec}.test.js` (node assert puro, sin framework;
correr con `node test/<archivo>`). Si tocas parseo/agregaciones/validación del panel admin o KPIs,
escribe tests primero (skill `test-driven-development`) siguiendo ese estilo.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

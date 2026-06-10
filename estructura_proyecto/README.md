# estructura_proyecto/ — Arquitectura técnica (resumen + punteros)

Resumen de cómo está armado el sistema. El detalle exhaustivo vive en `../ARQUITECTURA.md`
(fuente de verdad) y el mapa real del código en el grafo (`graphify-out/`, ver `graphify query`).

## Topología

```
Internet ──▶ nginx (rtb_web, 80/443, TLS Let's Encrypt)
                 ├─ www.refacrtb.com.mx  ──▶ frontend estático + proxy /api ──▶ Express :3000 (PM2)
                 ├─ nube.refacrtb.com.mx ──▶ nextcloud:80 ──▶ postgres:15
                 └─ office.refacrtb...    ──▶ collabora:9980
Correo (compose aparte, red aislada): mailserver (Postfix/Dovecot/Amavis/ClamAV/SpamAssassin/fail2ban)
                                       puertos 25/587/993, relay saliente vía MailerSend
```

## Componentes

| Componente | Tecnología | Ubicación | Notas |
|---|---|---|---|
| Reverse proxy | nginx | `docker/` (`rtb_web`) | TLS, vhosts, proxy a `:3000` |
| Backend API | Node.js/Express 5, PM2 | `web/RTB_Web/backend/` | `localhost:3000`; sesión + bcrypt |
| Frontend | HTML/CSS/JS vanilla | `web/RTB_Web/frontend/` | público + `/admin/` |
| Correo | docker-mailserver | `mailserver/` | compose y red propios |
| Nube | Nextcloud + Collabora | `docker/` + `nextcloud/` | docs en tiempo real |
| DB | PostgreSQL 15 | `db/` | solo para Nextcloud |

## Backend — estructura interna

`server.js` (bootstrap) → `routes/` → `controllers/` → `middleware/requireAuth.js` →
`utils/pdfGenerator.js`. Estado runtime del panel: `backend/data/mailbox-state.json` (gitignored).
Operaciones de buzón vía `execFile('docker', ['exec','mailserver','setup',…])` (sin shell).

## Dependencias clave (backend)

`express`, `express-session`, `bcryptjs` (auth), `puppeteer` (PDF), `webdav` (Nextcloud),
`cors`, `cookie-parser`, `dotenv`.

## Mapa del código (grafo AST)

`graphify-out/graph.json` — 93 nodos / 97 aristas / 16 comunidades, construido sobre
`web/RTB_Web/{backend,frontend}` + `api/` (sin `node_modules` ni dirs de datos).

- God node: `openModal()` (admin.js, 7 aristas) — el panel admin es el centro de gravedad.
- Comunidades: SPA admin (C1), routing backend (C2), utilidades de buzón (C0), contacto/PDF (C4),
  auth admin (C5). Detalle en `graphify-out/GRAPH_REPORT.md`.
- Sin ciclos de importación.

Para preguntas concretas usa el grafo en vez de leer a ciegas:
`graphify query "<pregunta>"`, `graphify explain "<nodo>"`, `graphify path "<A>" "<B>"`.

## Despliegue

IONOS Madrid, Ubuntu 22.04, Docker 28 / Compose v2, PM2. Detalle operativo: `../OPERACIONES.md`.
Deuda técnica priorizada: `../MEJORAS.md`. Issues abiertos: `../.ai-agents/errors/ERROR_LOG.md`.

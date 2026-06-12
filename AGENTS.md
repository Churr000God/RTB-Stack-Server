# AGENTS.md — Guía para agentes en RTB

Complementa a `CLAUDE.md`. Aquí va el **orden de lectura del código**, qué está activo vs.
legado, y qué skills usar por tipo de tarea.

## Antes de leer código: usa el grafo

El grafo está en `graphify-out/` (AST de `web/RTB_Web/{backend,frontend}` + `api/`).

```bash
graphify query "cómo funciona el login del panel admin"
graphify explain "openModal()"          # nodo concreto + vecinos
graphify path "loginAttempts" "router"  # relación entre dos nodos
```

Tras modificar código: `graphify update .` (AST, sin costo de API).

## Orden de lectura del código (módulo activo: backend + panel admin)

1. `web/RTB_Web/backend/server.js` — bootstrap Express, montaje de rutas, sesión, CORS.
2. `web/RTB_Web/backend/routes/` — `adminAuthRoutes.js` (login/logout/me),
   `mailAdminRoutes.js` (CRUD de buzones: crear, password, suspender/reactivar, cuota, vaciar,
   borrar), `contactRoutes.js`, `productos.routes.js`, `chatbot.routes.js`.
3. `web/RTB_Web/backend/middleware/requireAuth.js` — guard de sesión.
4. `web/RTB_Web/backend/controllers/contactController.js` — formulario → PDF → Nextcloud (WebDAV).
5. `web/RTB_Web/backend/utils/pdfGenerator.js` — Puppeteer.
6. Frontend del panel: `web/RTB_Web/frontend/admin/{index.html,admin.js,admin.css}` — SPA:
   login, tabla de buzones, modales con doble confirmación.

## Mapa de comunidades del grafo (referencia rápida)

- **Comunidad 1** — SPA del panel admin (`admin.js`): `openModal()` es el god node (7 aristas),
  más `checkAuth()`, `loadAccounts()`, los `open*Modal()`.
- **Comunidad 2** — routing del backend (`server.js` monta `adminAuthRoutes`, `contactRoutes`,
  `mailAdminRoutes`, middlewares `cors`/`cookieParser`).
- **Comunidad 0** — utilidades de buzones (`execFile`, `requireAuth`, `readState()`, `DATA_DIR`).
- **Comunidad 4** — contacto/PDF (`puppeteer`, `generatePDF()`, `createClient` de WebDAV).
- **Comunidad 5** — auth admin (`bcrypt`, `loginAttempts`, `router`).

## Activo vs. legado

| Estado | Módulos |
|---|---|
| ✅ Activo | `web/RTB_Web/{frontend,backend}`, `mailserver/`, `nextcloud/`, `docker/` |
| ⚠️ Legado / sin uso | `api/` (FastAPI, crash-loop), `app/` (boilerplate) |
| ⚠️ Placeholder vacío | `admin/ finanzas/ logistica/ ventas/ nube/` (en raíz) |

## Skills sugeridos por tarea

- **`test-driven-development`** — antes de tocar parseo de cuentas, agregaciones o KPIs del panel.
- **`code-review`** — si el cambio toca >1 módulo o KPIs visibles.
- **`verify` / `run`** — validar comportamiento real (arrancar backend, golpear `/api/admin/*`).
- **`verification-before-completion`** — antes de cerrar cualquier tarea.
- **`security-review`** — obligatorio antes de merge a `main` (esto maneja correo y auth).
- **`deep-research`** — si hay incertidumbre técnica (p. ej. fail2ban/nftables, docker-mailserver).

## Convenciones

- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `style:`) en español.
- Mensajes de error de cara al usuario: en español.
- No introducir frameworks nuevos en el frontend (es vanilla a propósito).

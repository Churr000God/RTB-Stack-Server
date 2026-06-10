# diseno_paginas/ — Notas de diseño de las páginas

Convenciones de UI/UX de las páginas con interacción. El frontend es **HTML/CSS/JS vanilla**
a propósito (sin framework). Mantener ese enfoque salvo decisión explícita.

## Panel de administración — `/admin/`

Archivos: `web/RTB_Web/frontend/admin/{index.html, admin.css, admin.js}`.
SPA mínima (sin router/framework). Estados controlados desde `admin.js`:

### Estados de pantalla
- **Login** (`showLogin()`): solo campo contraseña (no hay usuario). Tras éxito → panel.
  Rate-limit 5 intentos / 15 min en el backend.
- **Panel** (`showAdmin()`): tabla de buzones cargada por `loadAccounts()` desde
  `GET /api/admin/mail/accounts`. Comprobación de sesión vía `checkAuth()` → `GET /api/admin/me`.

### Tabla de buzones
- Columnas: email (en negrita, `word-break` para direcciones largas), estado, cuota, acciones.
- Fila con hover sutil. Breakpoints responsive: **900px** y **640px**.

### Botones de acción (rediseño commit `d244e892`)
- Clase `.btn-icon`: pastillas compactas con outline + texto de color (no se desbordan en
  pantallas medianas — se eliminó `white-space: nowrap`).
- Variantes: `--ok` (verde, p. ej. *Reactivar*), `--danger` (outline rojo, *Borrar* / *Vaciar*).
- Acciones por fila: cambiar contraseña, suspender/reactivar, fijar cuota, vaciar, borrar.

### Modales (`openModal()` — god node del grafo)
- Un único contenedor de modal reutilizado; `openModal()` lo abre y cada `open*Modal()`
  (`openPwdModal`, `openSuspendModal`, `openUnsuspendModal`, `openQuotaModal`, `openEmptyModal`,
  `openDelModal`) inyecta su formulario.
- **Doble confirmación** en acciones destructivas: el admin debe **escribir el email** del buzón
  para habilitar el botón de confirmar.
- `genPassword()` genera contraseñas para crear/reactivar.
- Mensajes de error en **español**, legibles para el usuario.

### Principios
- Toda acción destructiva (vaciar, borrar, suspender) → confirmación explícita.
- No introducir dependencias de frontend nuevas.
- Cambios visibles en el panel o en KPIs → pasar por `code-review` y, antes de `main`,
  `security-review`.

## Sitio público — `web/RTB_Web/frontend/`

`index.html` redirige a `/pages/`. Catálogos en `productos/` (ferretería, grifería, etc.),
componentes compartidos en `components/` (`header.html`, `footer.html`). Diseño orientado a
catálogo; sin lógica sensible.

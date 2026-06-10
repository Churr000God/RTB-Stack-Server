# contexto/ — Lógica de negocio y diccionario de dominio (fuente de verdad)

Qué significan las cosas en RTB, en términos de negocio. Cuando el código y este documento
discrepen, **esto es la intención**; corrige el código o pregunta, no al revés.

## Organización

**Refacciones Tomás Badillo** — comercio de refacciones/ferretería. Dominio: `refacrtb.com.mx`.
El servidor da soporte a su operación interna: correo corporativo, nube de archivos
(Nextcloud), sitio web y un panel de administración de buzones.

## Diccionario de dominio

| Término | Significado |
|---|---|
| **Buzón / cuenta** | Casilla de correo `usuario@refacrtb.com.mx` gestionada por docker-mailserver. |
| **Suspender** | Bloquear acceso sin borrar el buzón: el backend randomiza la contraseña y marca la cuenta como suspendida en `web/RTB_Web/backend/data/mailbox-state.json`. El correo sigue existiendo. |
| **Reactivar** | Quitar la suspensión asignando una contraseña nueva provista por el admin. |
| **Cuota** | Límite de almacenamiento del buzón (`docker exec mailserver setup quota set <email> <NG>`). Sufijos K/M/G. |
| **Vaciar buzón** | Borrar TODOS los correos del buzón (`doveadm`/expunge) manteniendo la cuenta activa. Acción destructiva → doble confirmación en la UI. |
| **Admin** | Único rol del panel. Autenticación por contraseña (sin usuario), sesión con cookie. No hay multiusuario. |

## Buzones (12, roles)

`contacto`, `ventas`, `finanzas`, `facturacion`, `almacen`, `recursos_humanos`, `sistemas`,
`asistente`, `productos_especiales`, `gerente_general`, `angel_badmon`, `tbadillob`.

> El número y los nombres pueden cambiar: la **fuente viva** es `docker exec mailserver setup
> email list`. No hardcodear esta lista en código nuevo.

## Flujos clave

- **Formulario de contacto** (público): el visitante envía el formulario → backend genera un PDF
  (Puppeteer) → lo sube a Nextcloud vía WebDAV → además puede enviar correo de aviso. Ver
  `contexto`/`controllers/contactController.js`.
- **Gestión de buzones** (panel admin): listar → crear / cambiar contraseña / suspender /
  reactivar / fijar cuota / vaciar / borrar. Toda operación destructiva exige escribir el email
  para confirmar.
- **Correo saliente**: relay vía MailerSend (`smtp.mailersend.net:587`); el envío directo por el
  puerto 25 no es posible (IONOS lo bloquea).
- **Webmail**: los usuarios acceden a su buzón por navegador en `https://mail.refacrtb.com.mx`
  (Roundcube), además de por cliente IMAP.

## Reglas de negocio implícitas

- Las acciones del panel son **operativas y sensibles** (afectan correo real de la empresa):
  cualquier cambio en su lógica debe pasar por `security-review` antes de `main`.
- Suspender ≠ borrar. No "limpiar" cuentas suspendidas sin instrucción explícita.

> Detalle técnico (no de dominio): ver `../estructura_proyecto/` y el grafo (`graphify query`).

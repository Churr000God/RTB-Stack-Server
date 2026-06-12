# Propuestas de mejora — Servidor RTB

Listado priorizado de mejoras detectadas durante la auditoría del 2026-05-13. Cada ítem incluye **diagnóstico**, **impacto**, **propuesta** y **esfuerzo estimado** (S=horas, M=día, L=semanas).

Prioridad: 🔴 crítica · 🟠 alta · 🟡 media · 🟢 baja

---

## 🔴 Seguridad

### S1. Sacar credenciales hardcoded del repo a `.env` (sin rotación)

**Diagnóstico.** En `docker/docker-compose.yml` hay credenciales en texto plano:
- Nextcloud admin: `admin / admin123`
- PostgreSQL: `admin / securepass`
- Collabora: `admin / adminpass`

> Nota: durante la sesión inicial se compartieron también la contraseña de `sistemas@refacrtb.com.mx` y el API token SMTP de MailerSend. Esa comunicación fue **interna** entre el operador y el asistente, no se expuso externamente, por lo que **no requiere rotación inmediata**. Aun así, sigue siendo buena higiene mantener esos secretos fuera del repo.

**Impacto.** Si el repo se hace público o se filtra, acceso administrativo total a Nextcloud, BD y suite de correo.

**Propuesta.**
1. Crear `/opt/proyectos/rtb/.env` (fuera de git) con todas las contraseñas actuales.
2. Referenciarlas en `docker-compose.yml` con `${VAR}` o `env_file:`.
3. Añadir `.env` al `.gitignore` (ver H3).
4. Opcional a medio plazo: adoptar Docker Secrets o SOPS para cifrado en repo.

**Esfuerzo.** S.

---

### S2. fail2ban con `nftables-allports` da falsa percepción de caída

**Diagnóstico.** `mailserver/fail2ban/jail.local` configura `banaction = nftables-allports`. Cuando un usuario falla en su login IMAP, queda bloqueado para ICMP, HTTP, HTTPS, etc., lo que indica falsamente que el servidor está caído (fue exactamente el caso de hoy con la IP 201.141.18.51).

**Impacto.** Pérdida de tiempo en diagnóstico, soporte gastado en falsos positivos, mala UX para los empleados.

**Propuesta.**
- Cambiar a `banaction = nftables-multiport` para que el ban afecte solo a puertos de correo.
- Reducir `bantime` de `1w` a `1h` para errores triviales de tipeo. Mantener `1w` solo en el jail `custom` (ban manual).
- Agregar el rango de IPs corporativas a `ignoreip`. Ya hay `201.141.108.178` — confirmar si hace falta sumar más.

**Esfuerzo.** S.

---

### S3. Sin IPv6 y sin AAAA records

**Diagnóstico.** El servidor IONOS solo tiene IPv4. No hay AAAA para ningún subdominio. Esto causa que clientes en redes IPv6-only (cada vez más comunes) no puedan acceder. Hoy mismo el problema reportado nació de esa confusión (la IP saliente del cliente era IPv6 — sin equivalencia en el servidor).

**Impacto.** Inaccesibilidad parcial para clientes móviles modernos, especialmente con planes de operadores que están migrando a IPv6-only.

**Propuesta.**
- Pedir a IONOS habilitar IPv6 nativo en el VPS (suelen ofrecerlo gratis).
- Agregar AAAA records para `www`, `mail`, `nube`, `office` apuntando a la nueva IPv6.
- Reverso PTR de la IPv6 → `mail.refacrtb.com.mx` (importante para reputación SMTP).

**Esfuerzo.** S (depende del proveedor).

---

### S4. SSH y políticas de host

**Diagnóstico.** No se verificó si el SSH del host está endurecido (no se tienen permisos para leer `sshd_config`). Existe `~/.ssh/id_ed25519` privado **sin passphrase** en el home (`~/.ssh/id_ed25519`).

**Impacto.** Si el host se compromete, la clave privada permite saltar a otros sistemas sin barrera adicional.

**Propuesta.**
- Auditar `sshd_config`: `PermitRootLogin no`, `PasswordAuthentication no`, `AllowUsers rtbadmin`.
- Proteger la clave privada con passphrase o moverla a un secret store.
- Considerar Tailscale / WireGuard para no exponer SSH al mundo.

**Esfuerzo.** M.

---

## 🟠 Operación y resiliencia

### O1. Sin backups automatizados

**Diagnóstico.** No existe estrategia de backup. `mail-data` pesa 8 GB, `nextcloud/data` 1.5 GB, PostgreSQL contiene metadatos críticos. Un fallo de disco pierde TODO.

**Impacto.** Riesgo de pérdida total de correos históricos y archivos compartidos.

**Propuesta.**
- Script `/opt/proyectos/rtb/scripts/backup-daily.sh` que respalde a S3-compatible (Backblaze B2 / Wasabi son baratos, ~$5/mes para este volumen). Usar `restic` con encriptación y deduplicación.
- Retención: 7 diarios + 4 semanales + 6 mensuales.
- Para Postgres, usar `pg_dumpall` (no copiar `/var/lib/postgresql/data` en caliente).
- Para mailserver, snapshot lógico con `tar` está bien si se hace con el servicio quieto o usar copia-en-vivo + verificación.
- Probar la restauración trimestralmente (un backup nunca probado no es backup).

**Esfuerzo.** M.

---

### O2. `api_rtb` en crash-loop hace 9 meses

**Diagnóstico.** El contenedor `api_rtb` lleva reiniciándose desde su creación. Error: `Could not import module "main"`. La causa: el bind mount `/opt/proyectos/rtb/api/app` está vacío y eclipsa los archivos que el Dockerfile copia a `/app/`.

**Impacto.** Logs ruidosos, ciclos de CPU desperdiciados, falsa señal en monitoreo. Aunque no afecta la funcionalidad (el backend Node sí está vivo), oculta problemas reales.

**Propuesta.** Una de dos:
- **Opción A — Eliminarlo si no se usa:**
  ```bash
  docker stop api_rtb && docker rm api_rtb
  docker image rm docker-api
  ```
- **Opción B — Arreglarlo si se planea usar:**
  - Mover `main.py`, `email_utils.py`, `requirements.txt` de `api/` a `api/app/`, **o**
  - Cambiar el bind mount a `/opt/proyectos/rtb/api:/app` (montar el directorio que sí contiene los archivos), **o**
  - Eliminar el bind mount completamente y usar la imagen ya construida.

  Y separar credenciales SMTP a un `.env` (no env vars en docker-compose).

**Decisión recomendada:** opción A — el endpoint que ofrecía (`POST /contact`) ya está cubierto por el backend Node (`POST /api/contacto`) con más features (PDF + WebDAV).

**Estado (2026-06-11): ✅ COMPLETADO** — contenedor e imagen eliminados.

**Esfuerzo.** S.

---

### O3. Sin swap y sin monitoreo externo

**Diagnóstico.** 16 GB RAM, 0 B swap originalmente. Un pico de Nextcloud + ClamAV escaneando un correo grande puede causar OOM kill.

No hay alertas externas: ni de disco lleno, ni de servicio caído, ni de cola Postfix saturada, ni de certificado por expirar.

**Impacto.** Caídas no detectadas a tiempo desde el exterior.

**Estado parcial (2026-06-12):**
- ✅ **Panel Servidor** implementado en el dashboard admin (`/admin/` → pestaña 🖥️ Servidor): métricas del host (CPU/RAM/disco/swap/uptime/carga), estado de los 8 contenedores con CPU%/RAM, estado PM2, jails fail2ban con IPs baneadas y visor de logs en vivo (SSE). Útil para diagnóstico activo desde el panel.
- ⚠️ **Swap**: el servidor tiene 4 GB de swap configurado (no 0 como se documentó originalmente — verificar con `free -h`). El panel Servidor muestra aviso visual si swap = 0.
- ❌ **Alertas proactivas** (Uptime Kuma / Netdata) siguen pendientes — el panel requiere que alguien lo abra; no notifica solo.

**Pendiente.**
- Instalar **Uptime Kuma** (1 contenedor) para checks HTTP/SMTP/IMAP y alertas por email/Telegram.
- Configurar `monit` o `systemd` para auto-reiniciar el `pm2-rtbadmin.service` si se cae.

**Esfuerzo.** S (Uptime Kuma); M (con dashboards completos).

---

### O4. Renovación TLS sin verificar

**Diagnóstico.** Hay certificados en `/etc/letsencrypt/` pero no se confirmó si certbot está configurado para auto-renovar y para recargar nginx tras la renovación.

**Impacto.** Si caducan los certs, todos los servicios HTTPS dejarán de funcionar de golpe.

**Propuesta.**
- Confirmar: `sudo systemctl list-timers | grep certbot`.
- Hook de renovación que recargue nginx: `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` con `docker exec rtb_web nginx -s reload`.
- Verificar fechas: `sudo certbot certificates`.

**Esfuerzo.** S.

---

## 🟡 Higiene del proyecto

### H1. Discrepancia entre docker-compose y realidad

**Diagnóstico.** Existen 3 compose files distintos:
- `/opt/proyectos/rtb/docker/docker-compose.yml` — el "oficial" pero apunta a `../web/html` (no existe).
- `/opt/proyectos/rtb/web/docker-compose.yml` — apunta a `./RTB_Web/frontend` (correcto).
- `/opt/proyectos/rtb/web/RTB_Web/deploy/docker-compose.yml` — usa certs en `./certs/...` (no Let's Encrypt).

El container actual de nginx fue creado a mano (no por un compose); el bind mount real es `/opt/proyectos/rtb/web/RTB_Web/frontend`. Si alguien corre `docker compose up` desde `/docker/` va a romper el setup.

**Impacto.** Confusión, riesgo de romper producción al "limpiar".

**Propuesta.**
- Consolidar en un único `docker-compose.yml` en `/opt/proyectos/rtb/` (root del proyecto) que sea la fuente de verdad.
- Eliminar los duplicados.
- Hacer que `git push` despliegue (o al menos, documentar el flujo).

**Esfuerzo.** M.

---

### H2. Carpetas vacías y archivos placeholder

**Diagnóstico.** `admin/`, `ventas/`, `finanzas/`, `logistica/`, `nube/`, `app/`, `api/app/` están vacías. `web/RTB_Web/database/schema.sql` y `seed.js` también. Hay `chatbot.routes.js` y `productos.routes.js` vacíos.

**Impacto.** Ruido cognitivo, sugerencia de funcionalidad inexistente.

**Propuesta.** Si son aspiracionales, ponerlas en `docs/roadmap.md`. Si no, `git rm -r`.

**Esfuerzo.** S.

---

### H3. Repo con un solo commit y sin remote

**Diagnóstico.** `git log` muestra "Initial commit: server structure" y nada más. No hay branching, ni release tags, ni `.gitignore` para excluir `node_modules/` (que está versionado al menos parcialmente).

**Impacto.** Imposible reconstruir el sistema, imposible hacer rollback, imposible auditar quién cambió qué.

**Propuesta.**
- Empujar el repo a GitHub privado o Gitea.
- `.gitignore` que excluya: `node_modules/`, `mail-data/`, `mail-state/`, `nextcloud/data/`, `db/data/`, `.env`, `*.pem`, `*.key`.
- Adoptar un flujo simple: `main` protegido, PRs revisadas, despliegue manual o por CI.
- Empezar a commitear con mensajes descriptivos (uno por cambio lógico, no megacommits).

**Esfuerzo.** M.

---

### H4. OnlyOffice descolgado

**Diagnóstico.** Corre desde hace 9 meses, expone `:8080`, pero nginx no lo enruta y Nextcloud no lo integra. Consume RAM y disco (varios volúmenes con datos efímeros).

**Impacto.** Recursos desperdiciados.

**Propuesta.** Decidir:
- **Si se usa Collabora**: parar y eliminar OnlyOffice (`docker stop onlyoffice && docker rm onlyoffice` + `docker volume prune`).
- **Si se quiere migrar a OnlyOffice**: integrarlo con Nextcloud (extensión "ONLYOFFICE") y parar Collabora.

**Esfuerzo.** S.

---

### H5. PostgreSQL en bind mount, no en volumen Docker

**Diagnóstico.** `db/data` es un bind mount al filesystem del host. Funcional pero menos portable y con permisos compartidos.

**Impacto.** Bajo. Pero migrar a volumen named simplifica backups y restore.

**Propuesta.** Considerar migrar a `postgres_data:/var/lib/postgresql/data` con volume named, y respaldar siempre via `pg_dumpall`.

**Esfuerzo.** S.

---

## 🟠 Funcionalidad nueva

### F1. Interfaz web para gestión de buzones de correo ✅

**Estado.** Implementado y desplegado en `https://www.refacrtb.com.mx/admin/` (2026-05-14).

**Acciones disponibles:**
- Listar cuentas con cuota usada/asignada y estado (Activa/Suspendida).
- Crear nuevo buzón (email + contraseña inicial).
- Cambiar contraseña.
- Definir cuota (con sufijos K/M/G, o sin límite).
- Vaciar todos los correos del buzón (preservando la cuenta y carpetas).
- Suspender / Reactivar (estado persistido en `backend/data/mailbox-state.json`).
- Eliminar (con doble confirmación tipeando el email).

**Backend:** rutas en `web/RTB_Web/backend/routes/{adminAuthRoutes,mailAdminRoutes,mailOpsRoutes,adminUsersRoutes}.js`,
helpers compartidos en `utils/{mailExec,auditLog,adminStore}.js`.
Invoca `docker exec mailserver setup email|quota`, `doveadm expunge` y `tar` con `execFile`/`spawn` (sin shell),
validación estricta de email/cuota/contraseña/usuario antes de cualquier ejecución.

**Seguridad:** bcrypt + express-session (cookie httpOnly secure, 4h, regeneración de id en login), rate limit
5 intentos / 15 min por IP, dominio fijo `@refacrtb.com.mx` para creaciones, roles `admin`/`operador`.
`requireAdmin` en: gestión de usuarios, start/stop/restart de contenedores, respaldos masivos (dominio/total)
y administración de fail2ban. Errores API sin detalles internos (el stderr va solo al log de PM2 vía `sendError`).
Sin CORS (todo same-origin vía nginx), `SESSION_SECRET` obligatorio en producción, CSP estricta en `/admin/`
(nginx `location`), validación anti-traversal en email/dominio (rechaza `..`). Auditoría con usuario real.

**Implementado (2026-06-10) — dashboard de control de correo:**
- ✅ Log de auditoría (`data/audit-log.jsonl`, pestaña Auditoría) — quién hizo qué y cuándo.
- ✅ Multi-admin con cuentas individuales y roles (`data/admins.json`); el admin raíz se siembra desde `.env`.
- ✅ Dashboard con KPIs, almacenamiento por dominio, verificador DNS (MX/SPF/DKIM/DMARC/A) y monitor del contenedor.
- ✅ Respaldos en `tar.gz` por buzón / dominio / total (streaming, solo lectura).
- ✅ Instructivo de conexión por buzón descargable en PDF (impresión nativa).
- ✅ Monitor: tarjeta Salud deriva estado del contenedor; botones Levantar/Reiniciar/Detener (2026-06-11).
- ✅ DKIM generado y operativo; DMARC `p=reject`; mail-tester.com 9.2/10 (2026-06-11).
- ✅ Roundcube desplegado en `https://mail.refacrtb.com.mx`; envío externo verificado (2026-06-11).
- ✅ **Pestaña 🖥️ Servidor** (2026-06-12) — monitor de infraestructura general:
  - Métricas del host: CPU (8 núcleos), carga 1/5/15 min, RAM, swap (aviso si = 0), disco `/`, uptime.
  - Tabla de los 8 contenedores Docker con estado, CPU%, RAM y acciones start/stop/restart (solo admin, con allowlist fija).
  - Estado y reinicio del backend PM2 (`rtb_backend`) con retardo de seguridad pre-restart.
  - Jails fail2ban (via `docker exec mailserver fail2ban-client`) con IPs baneadas actuales.
  - Visor de logs: tail 300 líneas o streaming en vivo (SSE `EventSource`); se detiene al cambiar pestaña.
  - Todas las acciones auditadas (`docker_start/stop/restart`, `pm2_restart`) en `audit-log.jsonl`.
  - Backend: `routes/serverOpsRoutes.js` en `/api/admin/system`; parsers testeados en `test/systemExec.test.js`.
- ✅ **Endurecimiento + responsivo + fail2ban administrable** (2026-06-12, commits `421f9c55` y `4a278c43`):
  - Seguridad: ver párrafo **Seguridad** arriba (permisos por rol, sendError, CSP, anti-traversal, sesión).
  - **Fail2ban desde el panel**: banear/desbanear IPs por jail (`POST /api/admin/system/fail2ban/:jail/{ban,unban}`,
    solo admin). Valida formato de jail + existencia en listado vivo + IP con `net.isIP`; auditado (`f2b_ban`/`f2b_unban`).
    UI: chips de IP con ✕ para desbanear + formulario jail/IP para banear.
  - **Diseño responsivo**: tablas colapsan a tarjetas en móvil (`data-label`), pestañas desplazables, botones
    solo-icono en tablet, modales con Escape/foco/scroll-lock, ARIA en tabs/flash, spinners de carga.
  - Tests: `test/mailExec.test.js` (25) + validadores fail2ban en `test/systemExec.test.js` (28).

**Pendientes / mejoras futuras:**
- Suspensión que también deshabilite recepción (hoy solo bloquea login IMAP/SMTP).
- Respaldos automatizados a almacenamiento externo (ver O1) — hoy son descargas manuales bajo demanda.
- Alertas proactivas (Uptime Kuma / Netdata) — el panel Servidor requiere apertura manual; ver O3.

---

## 🟢 Mejoras opcionales

### M1. Reverse proxy: considerar Caddy o Traefik

**Diagnóstico.** nginx funciona pero TLS y reverse-proxy se gestionan manualmente. Caddy automatiza Let's Encrypt y es 1 archivo de config; Traefik se integra nativamente con etiquetas de Docker.

**Propuesta.** Migración a Caddy reduciría ~40 líneas del `default.conf` actual y eliminaría el paso manual de renovar/recargar.

**Esfuerzo.** M.

---

### M2. Logs estructurados y centralizados

**Diagnóstico.** Cada contenedor escribe logs en su propio formato. Sin agregación.

**Propuesta.** Loki + Promtail + Grafana (todo en Docker) — stack ligero, free, ideal para 1 servidor.

**Esfuerzo.** L (configurar dashboards y queries útiles toma tiempo).

---

### M3. Hardening del mailserver

**Diagnóstico.** El servidor de correo es funcional pero faltan verificaciones de reputación:
- SPF, DKIM, DMARC configurados correctamente.
- PTR record (reverso) coherente con el HELO.
- ARC para preservar firmas al reenviar.

**Estado (2026-06-11): ✅ COMPLETADO**
- mail-tester.com: **9.2/10**. `dkim=pass`, `SPF valid`, DMARC `p=reject` propagado.
- Los 0.8 puntos restantes son del relay MailerSend (SPF_HELO_NONE, RCVD_DOUBLE_IP_LOOSE) — no accionables desde este servidor.

**Esfuerzo.** S.

---

### M4. Frontend con build pipeline

**Diagnóstico.** Frontend es HTML/CSS/JS plano. No hay minificación, no hay cache busting (de hecho hay `Cache-Control: no-store` en producción — anti-cache total, malo para performance).

**Propuesta.** Adoptar Vite o un bundler simple. O al menos quitar el anti-cache de producción y poner hashes en los assets.

**Esfuerzo.** M.

---

### M5. Documentación viva

**Diagnóstico.** Este es el primer documento del repo. Sin documentación, el conocimiento vive en la memoria de quien instaló.

**Propuesta.**
- Mantener este `MEJORAS.md` actualizado (marcar items resueltos con ✅).
- Agregar `CHANGELOG.md` con cambios relevantes por fecha.
- En cada cambio importante de infra: commitear el doc actualizado en el mismo PR.

**Esfuerzo.** continuo.

---

## Plan sugerido por sprints

### Sprint 1 (esta semana) — Seguridad inmediata
- [ ] S1 — mover credenciales de compose a `.env`
- [ ] S2 — fail2ban `multiport` + ajustar bantime
- [ ] O2 — eliminar `api_rtb` o moverlo a `api/app/`
- [ ] O3 — añadir swap (5 min)
- [x] **F1 — interfaz web para gestión de buzones de correo** ✅

### Sprint 2 (próximas 2 semanas) — Resiliencia
- [ ] O1 — backups con restic + Backblaze B2
- [ ] O4 — confirmar auto-renovación TLS + hook nginx
- [ ] O3 (segunda parte) — Uptime Kuma con alertas

### Sprint 3 (mes 1) — Higiene
- [ ] H1 — consolidar docker-compose
- [ ] H3 — repo en GitHub/Gitea con `.gitignore` correcto
- [ ] H4 — decidir OnlyOffice vs Collabora
- [ ] S3 — IPv6 (depende de IONOS)

### Backlog
- M1, M2, M3, M4, M5 — cuando haya capacidad.

---

_Auditoría realizada el 2026-05-13. Revisar y actualizar trimestralmente._

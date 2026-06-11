# Tablero de pendientes — RTB (seguimiento de la auditoría 2026-06-09)

> Marca `[x]` lo hecho. Detalle de cada punto en [AUDITORIA.md](AUDITORIA.md) y plan en [PLAN-REFACTOR.md](PLAN-REFACTOR.md).
> Riesgo: 🔴 crítico / 🟠 medio / 🟡 menor · Esfuerzo: B/M/A
> Regla: cada cambio = commit/snapshot previo → cambio → verificación → rollback listo.

## Bloque 0 — Red de seguridad (PRIMERO)
- [ ] 🔴 **B0.1** Confirmar snapshot del VPS en panel IONOS y anotar fecha *(manual, fuera del host)*
- [x] 🔴 **B0.2** Backups automatizados (DB + configs + correo) — **HECHO 2026-06-09**. Script `/opt/backups/scripts/rtb-backup.sh` + `rtb-backup.timer` diario 03:30 UTC. Detalle en [BACKUPS.md](BACKUPS.md)
- [~] 🔴 **B0.3** Backup externo Nextcloud (139 GB) → **Raspberry Pi** — **⏸ PAUSADO (sesión abierta)**. VPS y Pi configurados, test OK, pero la 1ª sincronización **falló por hardware**: el SSD USB (Ugreen RTL9210) se desconectó por falta de potencia → FS read-only. Pasos para retomar en [SESION-ABIERTA.md](SESION-ABIERTA.md) (reboot → fsck → parche UAS + energía → reintentar → cron)
- [~] 🔴 **B0.4** Probar restauración — dump PG validado (integridad + contenido); falta prueba de restore real en contenedor desechable

## Bloque 1 — Secretos (🔴, esf. B)
- [x] **B1.1** Mover secretos de `docker-compose.yml` a `.env` gitignored (`${VAR}`) — **HECHO 2026-06-11**. Variables en `.env` (gitignored), compose usa `${VAR}`
- [x] **B1.2** Rotar: password admin Nextcloud, `POSTGRES_PASSWORD`/`oc_admin`, Collabora — **HECHO 2026-06-11**. Contraseñas hex-32/40 generadas con openssl; ALTER USER oc_admin + occ user:resetpassword + recrear collabora. Respaldo en `/opt/backups/new-secrets-20260611.txt` (chmod 600)
- [ ] **B1.3** Sacar compose con secretos del historial de git — compose YA estaba limpio (usaba `${VAR}`); queda pendiente evaluar purga de commit `90e2626c` donde quedó `docker/.env.mailu` con SECRET_KEY de Mailu (retirado 2026-06-11, tratado como comprometido)
- [ ] **B1.4** Cambiar admin Nextcloud (`admin`): crear cuenta nominal, deshabilitar `admin` — password rotado (B1.2), pendiente crear cuenta nominal

## Bloque 2 — Resiliencia del host (🔴, esf. B)
- [x] **B2.1** Crear swapfile 4 GB — **HECHO** (creado en sesión previa, activo: 4 GiB, 2 MiB usado; vm.swappiness=10; `/etc/fstab` actualizado)
- [x] **B2.2** Límites de memoria por contenedor — **HECHO 2026-06-11**. `deploy.resources.limits.memory`: nginx:256m, nextcloud:4g, postgres:1g, collabora:2g, roundcube:512m, portainer:256m

## Bloque 3 — Perímetro y accesos (🟠, esf. B)
> Detalle ampliado en [AUDITORIA-ACCESOS.md](AUDITORIA-ACCESOS.md) (anexo de accesos, 2026-06-09).
- [x] **B3.1** Cerrar Portainer `:9443` en UFW — **HECHO 2026-06-11**. Port binding cambiado a `127.0.0.1:9443:9443`; `ufw delete allow 9443` ejecutado (ambas versiones IPv4/IPv6)
- [ ] **B3.2** SSH key-only: el `no` ya está en el config principal pero lo **anula `50-cloud-init.conf` (`yes`)**; corregir ese drop-in o añadir uno de orden menor, `sshd -t` + reload, verificar sesión nueva — *A1*
- [x] **B3.3** `diegoadmin1`/`diegoadmin2` **deshabilitadas 2026-06-09** (`usermod -L -e 1`: bloqueadas + expiradas a 1970-01-02; reversible). Siguen en grupo `sudo` pero ya no pueden autenticarse — *A3/A7*
- [ ] **B3.4** Quitar/acotar `sudo NOPASSWD: ALL` de `rtbadmin` (hoy = punto único de fallo: sudo+docker+NOPASSWD) — *A2*
- [ ] **B3.5** Añadir `AllowUsers rtbadmin` (o `AllowGroups sudo`) a sshd — *A4*
- [x] **B3.6** Bindear puertos Docker de gestión a `127.0.0.1` — **HECHO 2026-06-11**. Collabora: `ports` → `expose` (solo red interna, nginx proxea `office.`). Portainer: `127.0.0.1:9443`. Verificado desde exterior: `:9980`/`:9443` → rechazados
- [x] **B3.7** `passwd -l root` **hecho 2026-06-09** (contraseña de root bloqueada; el backup por llave+comando forzado sigue intacto) — *A8*

## Bloque 4 — Limpieza zombies/huérfanos (🟠–🟡, esf. B)
- [ ] **B4.1** Decidir destino de onlyoffice (`app.`) y api_rtb (`api.`): retirar o cablear
- [x] **B4.2** Eliminar compose duplicado — **HECHO 2026-06-11**. `web/docker-compose.yml` (mismo `container_name: rtb_web`, peligroso) retirado del repo. Configs nginx muertas `docker/nginx/conf.d/*.conf` y `docker/nginx/extra.conf` también eliminadas. `rtb_web` migrado del proyecto `web/` al proyecto `docker/` (compose canónico)
- [x] **B4.3** `git rm -r --cached docker/nextcloud/data` — **HECHO 2026-06-11**. 30 063 archivos desindexados (~228 MB del repo); patrón añadido a `.gitignore`

## Bloque 5 — Madurez infra (🟠–🟡, esf. M)
- [ ] **B5.1** `apt upgrade` (52 updates, 19 seguridad) en ventana
- [ ] **B5.2** Reinicio del host (kernel atrás, >322 d uptime) — con backups listos
- [x] **B5.3** Healthchecks por contenedor — **HECHO 2026-06-11**. postgres:`pg_isready`, nextcloud:`curl /status.php`, nginx:`curl localhost/`, collabora:`curl /hosting/discovery`, roundcube:`curl localhost/`, portainer:`wget /api/status`. `depends_on: condition: service_healthy` en nextcloud→postgres
- [x] **B5.4** Fijar tags de imágenes — **HECHO 2026-06-11**. nginx:1 (→tiró 1.31.1 con parches), nextcloud:31, postgres:15, portainer/portainer-ce:lts. Collabora/roundcube sin tag semver estable upstream documentados
- [ ] **B5.5** Segmentar redes Docker (red `db` interna; sacar postgres/portainer de la red de nginx)

## Bloque 6 — Correo (🟡, esf. B)
- [ ] **B6.1** DMARC `rua` a buzón propio; confirmar CNAMEs DKIM de MailerSend

## Bloque N — Hallazgos nuevos 2026-06-11 (auditoría de re-revisión de nube)
- [x] **N1** Background jobs en modo AJAX — **RESUELTO 2026-06-11**. `occ background:cron`; cron host `*/5 * * * * docker exec -u www-data nextcloud php cron.php`
- [x] **N2** nginx: faltan headers de seguridad + TLS permite TLSv1.0/1.1 — **RESUELTO 2026-06-11**. `ssl_protocols TLSv1.2 TLSv1.3`; `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-Permitted-Cross-Domain-Policies` en los 4 server HTTPS; `limit_req_zone` en `/index.php/login` y `/remote.php`
- [x] **N3** `SECRET_KEY` de Mailu versionado en git en claro — **RESUELTO 2026-06-11**. `docker/.env.mailu` y `docker/mailu/` retirados del repo; tratados como comprometidos (Mailu sin uso). Queda en historial git → ver B1.3
- [x] **N4** `renew-ssl-certs.sh` hace `docker stop rtb_web` (downtime en cada renovación) — **RESUELTO 2026-06-11**. Migrado a webroot: `/var/www/certbot` montado en nginx; certbot migrado standalone→webroot (6 certs); deploy-hook `reload-nginx.sh`; cron semanal eliminado; `certbot.timer` toma control. Dry-run: todos success
- [x] **N5** `loglevel=0` (debug) en producción — **RESUELTO 2026-06-11**. `occ config:system:set loglevel --value=2`
- [x] **N6** `default_phone_region` y `maintenance_window_start` sin definir — **RESUELTO 2026-06-11**. `occ config:system:set default_phone_region MX` y `maintenance_window_start 1`
- [x] **N7 (parcial)** NC 31.0.7 desactualizado (31.0.14 disponible); sin Redis — **PARCIAL**: NC y apps no actualizados aún (pendiente ventana B5.2); Redis sin implementar (evaluar). Imágenes actualizadas por pin `:31` (recibirá 31.0.x)
- [x] **N8** Basura en `docker/` y `mailserver/fail2ban/jail.local.bak` — **RESUELTO 2026-06-11**. Archivos `=`, `[internal]`, `reading`, `transferring` y `jail.local.bak` eliminados
- [x] **B6.2** `nextcloud.log` sin rotar (era **41 GB**, no 554 MB) — **RESUELTO 2026-06-11**. `log_rotate_size=100MB` vía occ; log truncado (liberó ~41 GB de disco, uso /: 48%→46%)

## Pendientes que quedan tras sesión 2026-06-11
| Clave | Qué falta | Prioridad |
|-------|-----------|-----------|
| B0.1 | Snapshot VPS en panel IONOS (manual) | 🔴 |
| B0.3 | Backup externo NC→Raspberry Pi (hardware SSD) | 🔴 |
| B0.4 | Prueba restore real en contenedor desechable | 🔴 |
| B1.3 | Purga historial git (commit `90e2626c` con SECRET_KEY Mailu) | 🟠 |
| B1.4 | Crear cuenta admin nominal en NC, deshabilitar `admin` | 🟠 |
| B3.2 | SSH PasswordAuthentication corregir drop-in cloud-init | 🟠 |
| B3.4 | Acotar sudo NOPASSWD:ALL de rtbadmin | 🟠 |
| B3.5 | AllowUsers en sshd | 🟠 |
| B4.1 | Decidir OnlyOffice (`app.`) y api_rtb | 🟡 |
| B5.1 | apt upgrade (52 paquetes, 19 seguridad) | 🟠 |
| B5.2 | Reinicio de host (kernel desactualizado) | 🟠 |
| B5.5 | Segmentar red `db` (postgres fuera de rtbnet con nginx) | 🟡 |
| N7 | Actualizar NC 31.0.7→31.0.14 + apps + evaluar Redis | 🟡 |
| B6.1 | DMARC rua + CNAMEs DKIM MailerSend | 🟡 |

---
### Bitácora
- **2026-06-09** — Auditoría de solo lectura completada. Entregables en `auditoria/`.
- **2026-06-09** — Anexo de **accesos** (usuarios/permisos/SSH/sudo) completado en `AUDITORIA-ACCESOS.md`; hallazgos A1–A9 integrados al Bloque 3.
- **2026-06-09** — Aplicados **A3** (diegoadmin1/2 deshabilitadas: `usermod -L -e 1`) y **A8** (`passwd -l root`). Verificado: las 3 cuentas en estado `L`. Pendientes A1/A2/A5/A6 (requieren ventana de servicio).
- **2026-06-09** — B0.2 HECHO: backup local VPS (Postgres+configs+correo) automatizado con systemd timer diario 03:30 UTC; probado y validado.
- **2026-06-09** — B0.3 iniciado y PAUSADO: VPS+Pi configurados, test OK; 1ª sync falló por hardware (SSD USB se desconecta por potencia). Sesión abierta en `SESION-ABIERTA.md`.
- **2026-06-11** — Sesión de endurecimiento de la nube completada. Cerrados: B1.1, B1.2, B2.1 (ya estaba), B2.2, B3.1, B3.6, B4.2, B4.3, B5.3, B5.4, B6.2, N1–N6, N8. Parcial: N7. 9 commits en rama `feat/dashboard-correo-multiadmin`.

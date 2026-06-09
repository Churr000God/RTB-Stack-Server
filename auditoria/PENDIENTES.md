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
- [ ] **B1.1** Mover secretos de `docker-compose.yml` a `.env` gitignored (`${VAR}`)
- [ ] **B1.2** Rotar: password admin Nextcloud, `POSTGRES_PASSWORD`, Collabora
- [ ] **B1.3** Sacar compose con secretos del repo (`git rm --cached`) + evaluar purga de historial
- [ ] **B1.4** Cambiar admin Nextcloud (`admin/<redactado>`): crear nominal, deshabilitar `admin`

## Bloque 2 — Resiliencia del host (🔴, esf. B)
- [ ] **B2.1** Crear swapfile 4–8 GB (`fallocate`/`mkswap`/`swapon`/`fstab`, `vm.swappiness=10`)
- [ ] **B2.2** Límites de memoria por contenedor (`mem_limit`/`deploy.resources`)

## Bloque 3 — Perímetro y accesos (🟠, esf. B)
> Detalle ampliado en [AUDITORIA-ACCESOS.md](AUDITORIA-ACCESOS.md) (anexo de accesos, 2026-06-09).
- [ ] **B3.1** Cerrar Portainer `:9443` en UFW (acceso por túnel SSH / VPN) — *A6*
- [ ] **B3.2** SSH key-only: el `no` ya está en el config principal pero lo **anula `50-cloud-init.conf` (`yes`)**; corregir ese drop-in o añadir uno de orden menor, `sshd -t` + reload, verificar sesión nueva — *A1*
- [x] **B3.3** `diegoadmin1`/`diegoadmin2` **deshabilitadas 2026-06-09** (`usermod -L -e 1`: bloqueadas + expiradas a 1970-01-02; reversible). Siguen en grupo `sudo` pero ya no pueden autenticarse — *A3/A7*
- [ ] **B3.4** Quitar/acotar `sudo NOPASSWD: ALL` de `rtbadmin` (hoy = punto único de fallo: sudo+docker+NOPASSWD) — *A2*
- [ ] **B3.5** Añadir `AllowUsers rtbadmin` (o `AllowGroups sudo`) a sshd — *A4*
- [ ] **B3.6** Bindear puertos Docker de gestión a `127.0.0.1` (9980 Collabora, 8080 OnlyOffice) — hoy expuestos al mundo eludiendo UFW — *A5*
- [x] **B3.7** `passwd -l root` **hecho 2026-06-09** (contraseña de root bloqueada; el backup por llave+comando forzado sigue intacto) — *A8*

## Bloque 4 — Limpieza zombies/huérfanos (🟠–🟡, esf. B)
- [ ] **B4.1** Decidir destino de onlyoffice (`app.`) y api_rtb (`api.`): retirar o cablear
- [ ] **B4.2** Eliminar servicio `web` duplicado de `docker/docker-compose.yml`
- [ ] **B4.3** `git rm -r --cached docker/nextcloud/data` + `.gitignore` (repo 228 MB → bajar)

## Bloque 5 — Madurez infra (🟠–🟡, esf. M)
- [ ] **B5.1** `apt upgrade` (52 updates, 19 seguridad) en ventana
- [ ] **B5.2** Reinicio del host (kernel 37 versiones atrás, 322 d uptime) — con backups listos
- [ ] **B5.3** Healthchecks por contenedor (+ autoheal opcional)
- [ ] **B5.4** Fijar tags de imágenes a versión concreta
- [ ] **B5.5** Segmentar redes Docker (red `db` interna; sacar postgres/portainer de la red de nginx)

## Bloque 6 — Correo (🟡, esf. B)
- [ ] **B6.1** DMARC `rua` a buzón propio; confirmar CNAMEs DKIM de MailerSend

## Otros (🟡)
- [ ] **B6.2** `nextcloud.log` ≈ 554 MB sin rotar → configurar `log_rotate_size` / truncar (detectado 2026-06-09)

---
### Bitácora
- **2026-06-09** — Auditoría de solo lectura completada. Entregables en `auditoria/`.
- **2026-06-09** — Anexo de **accesos** (usuarios/permisos/SSH/sudo) completado en `AUDITORIA-ACCESOS.md`; hallazgos A1–A9 integrados al Bloque 3.
- **2026-06-09** — Aplicados **A3** (diegoadmin1/2 deshabilitadas: `usermod -L -e 1`) y **A8** (`passwd -l root`). Verificado: las 3 cuentas en estado `L`. Pendientes A1/A2/A5/A6 (requieren ventana de servicio).
- **2026-06-09** — B0.2 HECHO: backup local VPS (Postgres+configs+correo) automatizado con systemd timer diario 03:30 UTC; probado y validado.
- **2026-06-09** — B0.3 iniciado y PAUSADO: VPS+Pi configurados, test OK; 1ª sync falló por hardware (SSD USB se desconecta por potencia). Sesión abierta en `SESION-ABIERTA.md`.

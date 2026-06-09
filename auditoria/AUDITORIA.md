# Reporte de auditoría — hallazgos priorizados

> 2026-06-09 · solo lectura · marca: 🔴 crítico / 🟠 medio / 🟡 menor
> Esfuerzo: **B**ajo / **M**edio / **A**lto

## Resumen ejecutivo

El servidor está **funcional y razonablemente protegido en el perímetro** (UFW deny-by-default, sin open relay, certs válidos con renovación automática, fail2ban activo, root SSH deshabilitado, correo saliente vía relay con SPF/DMARC coherentes). Los riesgos reales no están en la red sino en **resiliencia y secretos**:

1. **No hay backups reales** de Nextcloud ni de Postgres (lo único que existe es una copia de correo vacía de hace ~11 meses). Es el riesgo #1.
2. **Secretos débiles en claro** en `docker-compose.yml` (y en el historial git), incluyendo el admin de Nextcloud (`admin/<redactado>`) accesible públicamente en `nube.`.
3. **Sin swap + sin límites de memoria** en un host único: un pico (Nextcloud ya usa 4.8 GB) puede tumbar TODO por OOM.
4. **Red Docker plana** (`rtbnet`): nginx cara-a-internet comparte red con Postgres y con Portainer (que monta `docker.sock`).

Varios issues "conocidos" ya no aplican o estaban mal descritos (ver §Correcciones a la doc).

## Matriz riesgo × esfuerzo (acción inmediata = arriba-izquierda)

| # | Hallazgo | Capa | Riesgo | Esf. | Acción |
|---|---|---|---|---|---|
| 1 | Sin backups de Nextcloud/Postgres; copia de correo vacía y vieja | Fase 0 | 🔴 | B–M | Implementar dump PG + tar de `nextcloud/data` + `config/` con cron y retención; **probar restauración** |
| 2 | Secretos en claro y débiles en compose (`<redactado>`, `<redactado>`, `<redactado>`) | F · Seguridad | 🔴 | B | Mover a `.env` (gitignored), **rotar** todas, sacar compose con secretos del repo |
| 3 | Nextcloud admin `admin/<redactado>` expuesto en `nube.` | B/C | 🔴 | B | Cambiar password admin YA; crear admin nominal; deshabilitar `admin` |
| 4 | Sin swap (0 B) + sin límites de memoria por contenedor | E · Infra | 🔴 | B | Crear swapfile (4–8 GB); poner `mem_limit`/`deploy.resources` por servicio |
| 5 | Portainer (9443) abierto a todo internet | A/E | 🟠 | B | Cerrar 9443 en UFW; acceder por SSH-tunnel o VPN; o detrás de nginx con auth |
| 6 | SSH `PasswordAuthentication yes` | F · Seguridad | 🟠 | B | Pasar a key-only (`PasswordAuthentication no`) tras confirmar llaves de los 3 usuarios |
| 7 | Red Docker plana `rtbnet` (nginx ↔ postgres ↔ portainer/docker.sock) | E · Infra | 🟠 | M | Segmentar: `db` solo nextcloud↔postgres; `proxy` solo nginx↔apps; sacar Portainer de rtbnet |
| 8 | 52 updates (19 seguridad) + kernel 37 versiones atrás, reinicio pendiente (322 d) | F · SO | 🟠 | M | `apt upgrade` en ventana; planear reinicio con backups listos (riesgo en host único) |
| 9 | Subdominios huérfanos `app.` (onlyoffice) y `api.` (crash-loop) | A/B | 🟠 | B | Decidir: retirar onlyoffice+api_rtb y sus DNS/cert, o terminar de cablearlos |
| 10 | `docker/nextcloud/data/` (30k archivos, 228 MB) trackeado en git | B · Higiene | 🟡 | M | `git rm -r --cached`, añadir a `.gitignore`; opcional purgar historial |
| 11 | Sin healthchecks en ningún contenedor | E · Infra | 🟡 | M | Añadir `healthcheck` a nginx/nextcloud/postgres/mailserver |
| 12 | Imágenes `:latest` / sin pin | E · Infra | 🟡 | B | Fijar tags por versión (reproducibilidad) |
| 13 | DKIM sin clave propia publicada; DMARC RUA genérico de IONOS | D · Correo | 🟡 | B | Confirmar firma DKIM de MailerSend (CNAMEs) y apuntar RUA a buzón propio |
| 14 | Dos compose definen `rtb_web` (uno vivo, uno fantasma en `docker/`) | E · Infra | 🟡 | B | Eliminar el servicio `web` duplicado de `docker/docker-compose.yml` |
| 15 | `api_rtb` en crash-loop con `restart: always` (consume reinicios) | E · Infra | 🟡 | B | Detener/retirar el contenedor (módulo sin uso) |

## Detalle por capa

### A. Reverse proxy + subdominios
- ✅ nginx enruta `www`/`nube`/`office` correctamente; HTTP→HTTPS 301; certs por subdominio válidos hasta 2026-08-08 con `certbot.timer` activo.
- 🟠 **Portainer 9443** es el único servicio de gestión expuesto directo a internet (sin pasar por nginx).
- 🟠 `app.` y `api.` tienen DNS + cert pero **sin server block** → superficie/coste sin uso.
- 🟡 `mail.` no tiene server block (correcto: es host de correo, no web).

### B. Web / apps
- ✅ Nextcloud 31.0.7 (versión reciente, con soporte).
- 🔴 Credencial admin trivial (`<redactado>`) en servicio público.
- 🟠 onlyoffice corriendo sin proxy ni uso aparente (zombie); `api_rtb` (FastAPI) en crash-loop por bind-mount que tapa el módulo `main` (módulo sin uso).

### C. Nube / almacenamiento
- ✅ Nextcloud al día; Postgres dedicado.
- 🔴 **Sin backup probado**. Crecimiento de `nextcloud/data` sin control de cuota a nivel host; al llenar `/` caen TODOS los contenedores.
- ✅ Nextcloud y Postgres no exponen puertos al exterior (solo red interna).

### D. Correo (auditoría dedicada)
- ✅ **No es open relay**; auth obligatoria; TLS forzado en salida; cola vacía.
- ✅ Salida vía MailerSend → SPF (`include:_spf.mailersend.net`) y DMARC `p=reject` coherentes.
- 🟡 DKIM propio no publicado (lo cubre el selector de MailerSend); PTR genérico (mitigado porque no se envía directo); RUA de DMARC apunta a buzón genérico de IONOS.

### E. Docker / infra (host único)
- 🔴 **0 swap + sin `mem_limit`**: OOM puede tumbar el host (Nextcloud ya en ~4.8 GB / 15.6 GB).
- 🟠 **Red plana** `rtbnet` sin segmentación: compromiso de nginx alcanza Postgres y Portainer (`docker.sock` = control total de Docker).
- 🟡 Sin healthchecks; imágenes sin pin; servicio `web` duplicado; `api_rtb` reiniciándose en bucle.

### F. Seguridad transversal
- ✅ UFW deny-by-default; fail2ban (sshd/postfix/dovecot); root SSH off; sudoers acotado.
- 🔴 Secretos en claro en compose **y en historial git** (rotar, no solo borrar).
- 🟠 SSH con password auth habilitado; 3 usuarios en `sudo`.
- 🟠 52 updates pendientes (19 seguridad) + reinicio pendiente.

## Correcciones a la documentación existente (verificado, no asumido)
- **fail2ban "allports"** (en `CLAUDE.md`/memoria): el `jail.local` vivo usa `iptables-multiport`, **no** `nftables-allports`. El comportamiento de "banear todos los puertos" **no está presente** hoy. → actualizar doc.
- **"backend escucha solo en localhost:3000"**: realmente bindea en `*:3000` (todas las interfaces); lo que lo protege es **UFW** (`3000/tcp` solo desde `172.25.0.0/16`), no el bind. → matizar doc.
- **"secretos en docker-compose"** (ya documentado): confirmado y además **están en el historial git** → rotación obligatoria.

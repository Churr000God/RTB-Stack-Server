# Auditoría de infraestructura RTB — 2026-06-09

Auditoría **de solo lectura** del servidor único `refacrtb.com.mx` (IONOS, `217.154.101.174`).
No se modificó ningún estado. Entregables:

| Documento | Contenido |
|---|---|
| [INVENTARIO.md](INVENTARIO.md) | Inventario maestro: sistema, contenedores, redes, subdominios, certs, correo, accesos, backups, git |
| [AUDITORIA.md](AUDITORIA.md) | Hallazgos priorizados (matriz riesgo × esfuerzo) + detalle por capa + correcciones a la doc |
| [AUDITORIA-ACCESOS.md](AUDITORIA-ACCESOS.md) | **Anexo de accesos**: usuarios del SO, grupos, sudo, SSH (config + llaves), login/fail2ban, docker como vector root (hallazgos A1–A9) |
| [ARQUITECTURA-DIAGRAMA.md](ARQUITECTURA-DIAGRAMA.md) | Diagramas Mermaid: petición→proxy→contenedor→datos y segmentación objetivo |
| [PLAN-REFACTOR.md](PLAN-REFACTOR.md) | Plan incremental por bloques (con rollback) + runbooks operativos |
| [PENDIENTES.md](PENDIENTES.md) | **Tablero rastreable** de los hallazgos (checklist por bloques) |
| [BACKUPS.md](BACKUPS.md) | Diseño, operación y restauración de los backups (Bloque 0) |
| [SESION-ABIERTA.md](SESION-ABIERTA.md) | 🟡 **Trabajo pausado**: backup externo en Raspberry Pi (cómo retomar) |
| [raspberry-pi/](raspberry-pi/) | Script `rtb-pull-backup.sh` + guía del destino externo (Pi) |

## Top 4 a atender primero
1. 🔴 **Sin backups reales** de Nextcloud/Postgres (la copia de correo está vacía y es de 2025-07).
2. 🔴 **Secretos débiles en claro** en `docker-compose.yml` y en historial git (`<redactado>`, `<redactado>`).
3. 🔴 **0 swap + sin límites de memoria** en host único → riesgo de OOM total.
4. 🟠 **Red Docker plana** + Portainer (9443) expuesto a internet.

## Lo que está bien (no tocar a ciegas)
UFW deny-by-default · sin open relay · correo saliente vía MailerSend con SPF/DMARC coherentes ·
6 certs válidos con auto-renovación · root SSH deshabilitado · fail2ban activo · Nextcloud 31.0.7 al día.

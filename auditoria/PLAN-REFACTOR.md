# Plan de refactor incremental + runbooks — RTB

> 2026-06-09 · Principio rector: **nada de big-bang**. Servidor único → un cambio puede tumbar TODO.
> Por cada paso: **snapshot/commit previo → cambio → verificación → rollback listo**.
> Todo lo que reinicie un servicio o toque datos requiere **confirmación explícita** antes de ejecutar.

## Orden recomendado (de mayor ROI / menor riesgo, hacia arriba)

### 🟢 Bloque 0 — Red de seguridad (ANTES de tocar nada más)
**Objetivo: poder revertir cualquier cosa.**
1. Confirmar/crear **snapshot del VPS en panel IONOS** y anotar fecha.
2. Implementar backups automáticos y **probar una restauración**:
   - Postgres: `docker exec postgres pg_dump -U admin nextcloud | gzip > /opt/backups/pg/nextcloud-$(date +%F).sql.gz`
   - Nextcloud: modo mantenimiento → `tar` de `nextcloud/data` (incl. `config/`) → quitar mantenimiento.
   - Configs: `tar` de los `docker-compose.yml`, `web/nginx/`, `mailserver/config/`, `/etc/letsencrypt`.
   - Correo: `tar` de `mailserver/mail-data` y `mail-state` (la copia actual está vacía).
   - cron diario + retención (p.ej. 7 diarios / 4 semanales) + copia **fuera del host**.
   - **Verificar**: restaurar el dump PG en un contenedor desechable y abrir el tar.

### 🟢 Bloque 1 — Secretos (riesgo alto, esfuerzo bajo)
3. Crear `docker/.env` (gitignored) con las variables; referenciar con `${VAR}` en compose.
4. **Rotar** todas: password admin Nextcloud, `POSTGRES_PASSWORD`, Collabora. (Cambiar PG password requiere actualizar también `config.php` de Nextcloud — coordinar.)
5. `git rm --cached docker/docker-compose.yml` con secretos → re-commit limpio. Evaluar purga de historial (`git filter-repo`) ya que las claves viejas quedaron en commits.
6. Cambiar **admin de Nextcloud** (`occ user:add` nominal, deshabilitar `admin`).

### 🟢 Bloque 2 — Resiliencia del host (riesgo alto, esfuerzo bajo)
7. **Swap**: crear swapfile 4–8 GB (`fallocate`, `mkswap`, `swapon`, `/etc/fstab`, `vm.swappiness=10`). *No reinicia servicios.*
8. **Límites de memoria** por contenedor en compose (`mem_limit`/`deploy.resources.limits`). Requiere recrear contenedor → uno por uno, verificando.

### 🟡 Bloque 3 — Perímetro y accesos (riesgo medio, esfuerzo bajo)
9. UFW: **cerrar 9443** (Portainer) al mundo; acceder por túnel SSH (`ssh -L 9443:localhost:9443`) o VPN.
10. SSH: confirmar que los 3 usuarios tienen su llave y luego `PasswordAuthentication no` + recargar sshd. **Verificar nueva sesión antes de cerrar la actual.**
11. Revisar si `diegoadmin1/2` siguen siendo necesarios; reducir miembros de `sudo` al mínimo.

### 🟡 Bloque 4 — Limpieza de zombies y huérfanos
12. Decidir destino de **onlyoffice** y **api_rtb**: si no se usan, `docker stop`/retirar del compose y **eliminar DNS + cert** de `app.` y `api.` (reduce superficie y carga de renovación).
13. Eliminar el servicio `web` duplicado de `docker/docker-compose.yml`.
14. `git rm -r --cached docker/nextcloud/data` + `.gitignore` (baja el repo de 228 MB).

### 🟡 Bloque 5 — Madurez infra (riesgo medio, esfuerzo medio)
15. **Updates SO**: `apt upgrade` en ventana; con backups listos, planear **reinicio** (kernel 37 versiones atrás, 322 d sin reboot). En host único: avisar downtime, tener snapshot.
16. Healthchecks por contenedor + (opcional) `autoheal`.
17. Fijar tags de imágenes a versión concreta.
18. **Segmentar redes** (ver diagrama): red `db` interna (nextcloud↔postgres), sacar postgres/portainer de la red de nginx. Recrear con cuidado, servicio por servicio.

### 🟢 Bloque 6 — Correo (afinado, bajo riesgo)
19. Apuntar DMARC `rua` a un buzón propio; verificar CNAMEs DKIM de MailerSend; documentar que el envío directo (sin relay) softfallaría SPF.

> Tras cada refactor de código relevante: `graphify update .` para mantener el grafo.
> Migraciones de datos (nube/buzones): **backup verificado y prueba de restauración ANTES**.

---

## Runbooks

### R1 · Renovar certificados (si fallara la auto-renovación)
Certs en `/etc/letsencrypt` (montado RO en `rtb_web` y `mailserver`). Renueva `certbot.timer` (2×/día).
```bash
sudo certbot renew --dry-run        # probar
sudo certbot renew                  # forzar
docker exec rtb_web nginx -s reload # recargar nginx
docker restart mailserver           # ⚠ confirmar: corta correo unos segundos
```

### R2 · Restaurar backup de Postgres
```bash
# en contenedor desechable primero para validar; luego en el real con mantenimiento
gunzip -c /opt/backups/pg/nextcloud-FECHA.sql.gz | docker exec -i postgres psql -U admin -d nextcloud
```

### R3 · Reiniciar correo con seguridad
```bash
docker exec mailserver mailq          # ver cola antes
docker compose -f mailserver/docker-compose.yml restart   # ⚠ confirmar downtime
docker logs -f mailserver             # verificar arranque Postfix/Dovecot
```

### R4 · Operar buzones (NO tocar `postfix-accounts.cf` a mano)
```bash
docker exec mailserver setup email list
docker exec mailserver setup email add usuario@refacrtb.com.mx
docker exec mailserver setup quota set usuario@refacrtb.com.mx 2G
# (el panel admin web envuelve esto vía execFile en routes/mailAdminRoutes.js)
```

### R5 · Si un subdominio "cae"
1. `curl -I https://<sub>.refacrtb.com.mx` → ¿responde nginx?
2. `docker ps` → ¿contenedor destino Up? `docker logs <c>`.
3. ¿Cert vencido? `openssl x509 -enddate -noout -in /etc/letsencrypt/live/<sub>/fullchain.pem`.
4. ¿Disco lleno? `df -h /` (al 100 % caen todos). ¿OOM? `dmesg | grep -i oom`.
5. `docker exec rtb_web nginx -t && docker exec rtb_web nginx -s reload`.

### R6 · Disco / memoria al límite (host único)
```bash
df -h /; docker system df          # qué ocupa
free -h; docker stats --no-stream  # memoria por contenedor
docker system prune -a             # ⚠ confirmar: borra imágenes/contenedores parados
```

### R7 · Reinicio del host (kernel/updates) — alto riesgo
1. Snapshot IONOS + backups verificados.
2. Avisar downtime. `sudo apt update && sudo apt upgrade`.
3. `sudo reboot`. Tras arranque: verificar `docker ps` (todos los `restart` arrancan), `pm2 list` (backend Node), `curl` a cada subdominio, `mailq`.

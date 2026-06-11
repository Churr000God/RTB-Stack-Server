# Sesión de endurecimiento — Nube (2026-06-11)

> Rama: `feat/dashboard-correo-multiadmin` · 10 commits · Ejecutado por: rtbadmin + Claude Opus 4.8

## Objetivo
Auditar y endurecer el stack nube completo (Nextcloud + Collabora + Postgres + nginx + certbot).
Alcance elegido: **todo lo accionable** (secretos, swap, mem_limits, TLS, perímetro, cron, imágenes).

## Hallazgos nuevos (no estaban en `PENDIENTES.md` previo)

| ID | Hallazgo | Severidad |
|----|----------|-----------|
| N1 | Background jobs NC en modo **AJAX** (tareas no corren sin navegación) | ALTO |
| N2 | nginx: TLSv1.0/1.1 permitidos + sin security headers | ALTO |
| N3 | `docker/.env.mailu` con SECRET_KEY Mailu **versionado en git** | CRÍTICO |
| N4 | `renew-ssl-certs.sh` hace `docker stop rtb_web` → downtime total HTTPS | ALTO |
| N5 | `loglevel=0` (debug) en producción | MEDIO |
| N6 | `default_phone_region` y `maintenance_window_start` sin definir | MEDIO |
| N7 | NC 31.0.7 (→31.0.14 disponible) + apps desactualizadas + sin Redis | MEDIO |
| N8 | Archivos basura en `docker/` + `jail.local.bak` | BAJO |

Adicionalmente: `nextcloud.log` era de **41 GB** (no 554 MB como indicaba doc previa).
`web/docker-compose.yml` era un duplicado peligroso del `container_name: rtb_web` del compose canónico.
Web root en `docker/docker-compose.yml` apuntaba a `../web/html` (vacío) en vez de `../web/RTB_Web/frontend`.

## Cambios aplicados

### Batch 1 — Higiene de repo
- `git rm --cached docker/.env.mailu docker/mailu/` — Mailu retirado (N3); SECRET_KEY comprometido
- `git rm -r --cached docker/nextcloud/data/` — 30 063 archivos, ~228 MB desindexados (B4.3)
- `git rm docker/nginx/conf.d/*.conf docker/nginx/extra.conf` — configs nginx nunca montadas
- `git rm web/docker-compose.yml` — duplicado peligroso de `rtb_web` (B4.2)
- `rm docker/{=,[internal],reading,transferring}` — basura Jul-2025 (N8)
- `rm mailserver/fail2ban/jail.local.bak` (N8)
- `.gitignore`: añadidos `docker/.env.mailu`, `docker/mailu/`, `docker/nextcloud/data/`

### Batch 2 — Hardening nginx (`web/nginx/default.conf`)
- `ssl_protocols TLSv1.2 TLSv1.3` + ciphers ECDHE/CHACHA20 + `ssl_session_cache 10m` (N2)
- Security headers en los 4 server HTTPS: `X-Content-Type-Options nosniff`, `X-Frame-Options SAMEORIGIN`,
  `Referrer-Policy no-referrer`, `X-Permitted-Cross-Domain-Policies none`, `X-Robots-Tag` (N2)
- `limit_req_zone nc_login 10r/m` + `limit_req` en `/index.php/login` y `/remote.php/dav` (anti-bruteforce)
- Verificado: TLSv1.0/1.1 rechazados con openssl; headers confirmados con curl -sI

### Batch 3 — Configuración Nextcloud (vía `occ`)
- `occ background:cron` + cron host `*/5 * * * * docker exec -u www-data nextcloud php cron.php` (N1)
- `occ config:system:set loglevel 2` (N5)
- `occ config:system:set default_phone_region MX` (N6)
- `occ config:system:set maintenance_window_start 1` (N6)
- `occ config:system:set log_rotate_size 104857600` + truncar log 41 GB → 0 (B6.2)

### Batch 4 — TLS sin downtime (N4)
- `/var/www/certbot` creado; montado en nginx como `:ro`
- nginx port-80: `location /.well-known/acme-challenge/ { root /var/www/certbot; }` (antes de redirect 301)
- 6 certs migrados `standalone`→`webroot` en `/etc/letsencrypt/renewal/*.conf`
- Deploy-hook: `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` (`nginx -s reload`)
- Cron semanal `renew-ssl-certs.sh` eliminado; `certbot.timer` (12h) toma control
- `certbot renew --dry-run`: **todos success** (6/6)
- `rtb_web` migrado del proyecto `web/` al proyecto `docker/` (compose canónico)

### Batch 5 — Perímetro
- Collabora: `ports: "9980:9980"` → `expose: "9980"` (solo red interna, nginx proxea `office.`) (B3.6)
- Portainer: `"9443:9443"` → `"127.0.0.1:9443:9443"` (B3.1)
- `ufw delete allow 9443` (IPv4 + IPv6)
- Verificado: `:9980` y `:9443` rechazados desde 217.154.101.174; `office.` → HTTP/2 200

### Batch 6 — Resiliencia
- Swap 4 GB ya estaba activo (sesión previa); `vm.swappiness=10` aplicado (B2.1)
- `deploy.resources.limits.memory` en todos los servicios (B2.2):
  `nginx:256m`, `nextcloud:4g`, `postgres:1g`, `collabora:2g`, `roundcube:512m`, `portainer:256m`
- Fix web root: `../web/html` → `../web/RTB_Web/frontend` (bug preexistente oculto)

### Batch 7 — Rotación de secretos (B1.1/B1.2)
- Contraseñas hex-32/40 generadas con `openssl rand -hex`
- Postgres: `ALTER USER oc_admin WITH PASSWORD '<nuevo>'` (usuario real de NC es `oc_admin`, no `admin`)
- NC: `occ config:system:set dbpassword <nuevo>`; `occ user:resetpassword --password-from-env admin`
- Collabora: recreado con nueva `COLLABORA_PASSWORD`
- `docker/.env` actualizado; respaldo en `/opt/backups/new-secrets-20260611.txt` (chmod 600)

### Batch 8 — Pin imágenes + Healthchecks (B5.3/B5.4)
- `nginx:latest`→`nginx:1` (tiró 1.31.1 con parches vs 1.29.0), `nextcloud:latest`→`nextcloud:31`,
  `portainer/portainer-ce:latest`→`portainer/portainer-ce:lts`
- Healthchecks: `postgres:pg_isready`, `nextcloud:curl /status.php`, `nginx:curl localhost/`,
  `collabora:curl /hosting/discovery`, `roundcube:curl localhost/`
- `depends_on: condition: service_healthy` en nextcloud→postgres (elimina race condition)
- Portainer: imagen scratch sin shell/curl — healthcheck omitido, `restart: unless-stopped` cubre fallos

## Incidente post-sesión — 2FA Nextcloud admin

**Síntoma:** usuario no podía entrar con contraseña nueva; log mostraba `Two-factor challenge failed` × 4.

**Causa:** TOTP y notificación Nextcloud configurados para `admin`; tras rotar contraseña y recrear
contenedores, los códigos TOTP no validaban (posible desincronización de sesión).

**Remediación:**
```bash
docker exec -u www-data nextcloud php occ twofactorauth:disable admin totp
docker exec -u www-data nextcloud php occ twofactorauth:disable admin twofactor_nextcloud_notification
```
2FA completamente desactivado. Usuario accede solo con contraseña.

**Acción pendiente:** reconfigurar TOTP en **Nextcloud → Configuración → Seguridad → Autenticación en dos pasos**.

## Estado final del stack

```
collabora   Up (healthy)   collabora/code
nextcloud   Up (healthy)   nextcloud:31
portainer   Up             portainer/portainer-ce:lts
postgres    Up (healthy)   postgres:15
roundcube   Up (healthy)   roundcube/roundcubemail:latest-apache
rtb_web     Up (healthy)   nginx:1  [1.31.1]
```

Sitios: `nube.`→302, `office.`→200, `mail.`→200, `www.`→200 ✓

## Commits de la sesión

```
5371d163 fix(docker): quitar healthcheck de portainer (imagen scratch sin shell/curl)
029e9da2 docs(auditoria): actualizar PENDIENTES.md con sesión 2026-06-11
ded1b976 feat(docker): pin de imágenes + healthchecks por contenedor (B5.3/B5.4)
aeaa9d68 chore(repo): stagear eliminación de archivos basura y .gitignore (Batch 1 restante)
e3c2ce3a feat(docker): mem_limits por contenedor + fix web root mount (B2.2)
86e1815d feat(docker): cerrar puertos gestión Collabora/Portainer al exterior (B3.1/B3.6)
1e01d371 feat(nube): cron NC, TLS webroot sin downtime, hardening Nextcloud (N1/N4/N5/N6/B6.2)
1643fbb6 feat(nginx): TLS hardening + security headers + rate-limit NC login (N2)
c37629e3 chore(repo): limpieza B1 — retirar Mailu, datos NC, nginx zombie, basura
```

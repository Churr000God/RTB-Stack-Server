# Operaciones — Servidor RTB

Guía rápida de comandos cotidianos. Todos se ejecutan como usuario `rtbadmin` en el host `217.154.101.174`.

## Ver estado general

```bash
docker ps                                        # contenedores activos
docker ps -a                                     # incluye detenidos
pm2 list                                         # procesos Node fuera de Docker
docker stats --no-stream                         # uso de CPU/RAM por contenedor
df -h /                                          # espacio en disco
free -h                                          # memoria
```

## Logs

```bash
# Correo
docker logs mailserver --tail 100
docker logs mailserver --since 1h | grep -i error

# Nginx
docker logs rtb_web --tail 100

# Nextcloud
docker logs nextcloud --tail 100

# Backend Node (PM2)
pm2 logs rtb_backend --lines 100
pm2 logs rtb_backend --err                       # solo errores
```

## Servidor de correo

### Panel web de administración

Para operación del día a día, usa el panel web:

- URL: **https://www.refacrtb.com.mx/admin/**
- Acceso: **usuario + contraseña** (usuario raíz `admin`). El login inicial usa el hash de `ADMIN_PASSWORD_HASH` del `.env`.
- Es un **dashboard por pestañas**: **Panel** (KPIs), **Buzones**, **Almacenamiento** (por dominio), **Auditoría**, **Guía de conexión** (+ instructivos por buzón), **Verificador DNS**, **Monitor** (estado/logs del contenedor mailserver + respaldos), **🖥️ Servidor** (host + todos los contenedores + PM2 + fail2ban) y **Administradores** (solo rol admin).
- Sesión: cookie httpOnly, expira a las 4 h de inactividad. Tras 5 intentos fallidos en 15 min se bloquea la IP.

**Buzones — acciones por fila:** listar (con cuota usada y estado, agrupado por dominio + búsqueda), crear, cambiar contraseña, definir cuota, suspender/reactivar, vaciar correos, eliminar, **descargar instructivo** (PDF) y **descargar respaldo** (tar.gz).

- **Suspender** cambia la contraseña a una aleatoria y marca el buzón como `Suspendida` (estado guardado en `backend/data/mailbox-state.json`). El correo se preserva. **Reactivar** pide una contraseña nueva.
- **Vaciar buzón** ejecuta `doveadm expunge -u <email> mailbox '*' all`: borra todos los correos en cualquier carpeta (INBOX, Sent, Drafts, Trash, etc.). Mantiene la estructura de carpetas y la cuenta activa. **Irreversible**.
- **Cuota**: acepta sufijos `K`, `M`, `G`. Vacío o `0` = sin límite. Tras cambiarla, hay ~2 s de propagación hasta que `setup email list` la refleja; el panel hace doble refresh para mostrarla.
- **Eliminar** borra el buzón **y todo su correo**. Doble confirmación tipeando el email. Si la cuenta es muy nueva (sin maildir creado aún), el backend pre-crea el directorio y reintenta automáticamente.

**Administradores (usuarios del panel):**

- Sistema **multi-admin con roles**: `admin` (acceso total + gestión de usuarios) y `operador` (gestiona buzones,
  pero **no** ve la sección Administradores, **no** puede iniciar/detener/reiniciar contenedores, **no** descarga
  respaldos masivos —dominio/total— y **no** administra fail2ban; el respaldo por buzón sí le está permitido).
- Solo un `admin` puede **crear usuarios**, **cambiar sus contraseñas** y **eliminarlos**. Protecciones: no puedes eliminar tu propio usuario ni dejar el sistema sin ningún admin.
- Persistencia: `backend/data/admins.json` (gitignored, hashes bcrypt, permisos `0600`). El admin raíz se siembra automáticamente desde `ADMIN_PASSWORD_HASH` la primera vez.
- **Rotar contraseña del admin raíz:** hazlo desde el panel (pestaña Administradores → Cambiar contraseña). Para resetear desde cero, borra `backend/data/admins.json`, regenera el hash bcrypt en `ADMIN_PASSWORD_HASH` y `pm2 restart rtb_backend` (se re-siembra).

**Auditoría, DNS, Monitor y Respaldos:**

- **Auditoría**: toda acción (alta/baja/contraseña/cuota/suspensión/vaciado/respaldo/login y gestión de usuarios) se registra en `backend/data/audit-log.jsonl` y se ve en la pestaña Auditoría.
- **Verificador DNS**: comprueba MX, A (`mail.`), SPF, DKIM (selector `mail`) y DMARC del dominio vía DNS, con estado OK / Revisar / Falta.
- **Monitor**: estado/salud, CPU y memoria del contenedor `mailserver`, últimas líneas de log, respaldos y comandos esenciales.
- **Respaldos**: descarga `tar.gz` por **buzón** (pestaña Buzones), por **dominio** (Almacenamiento, solo admin) o **total** (Monitor, solo admin). Se generan en streaming vía `docker exec … tar` (solo lectura, sin archivo temporal). El total pesa ~9 GB y puede tardar varios minutos.
- **Servidor** (2026-06-12): panel de infraestructura general. Ver sección dedicada más abajo.

Los comandos CLI siguen disponibles para emergencias o operaciones masivas:

### Cuentas (CLI)

```bash
# Listar cuentas y cuotas
docker exec mailserver setup email list

# Crear cuenta
docker exec -ti mailserver setup email add usuario@refacrtb.com.mx

# Cambiar contraseña
docker exec -ti mailserver setup email update usuario@refacrtb.com.mx

# Eliminar cuenta
docker exec -ti mailserver setup email del usuario@refacrtb.com.mx
```

### Fail2ban

**Desde el panel** (recomendado): pestaña **🖥️ Servidor → 🛡️ Fail2ban** (solo rol admin) — cada IP baneada
tiene un botón **✕** para desbanearla, y hay un formulario jail + IP para banear manualmente. Queda auditado
(`f2b_ban`/`f2b_unban`). Nota: la jail `custom` tiene bantime de **180 días** (las demás 1h); banear ahí es
un bloqueo de larga duración — verifica bien la IP.

CLI para emergencias (p. ej. si el panel mismo quedó baneado):

```bash
# Estado y bans actuales
docker exec mailserver fail2ban-client status
docker exec mailserver fail2ban-client status dovecot
docker exec mailserver fail2ban-client status postfix

# Desbanear una IP
docker exec mailserver fail2ban-client set dovecot unbanip 1.2.3.4
docker exec mailserver fail2ban-client set postfix unbanip 1.2.3.4
docker exec mailserver fail2ban-client set postfix-sasl unbanip 1.2.3.4

# IP propia en allowlist permanente: editar mailserver/fail2ban/jail.local
# (línea ignoreip = ...)
```

### Comprobar entrega

```bash
# Conexión IMAP local (sanity check)
echo "" | nc -w 3 127.0.0.1 993 >/dev/null && echo "IMAP OK"

# Cola Postfix
docker exec mailserver mailq

# Vaciar cola (cuidado)
docker exec mailserver postsuper -d ALL
```

### Relay saliente (MailerSend) y rotación de credenciales

El correo saliente **no usa envío directo**: el egress al puerto 25 está bloqueado por IONOS (587/443
sí salen). Va por relay a `smtp.mailersend.net:587`. Dos capas (ambas en `mailserver.env`):
`RELAY_HOST` (relay por remitente `@refacrtb.com.mx`) y `DEFAULT_RELAY_HOST` (fallback global para
bounces/`root@`). Las credenciales viven en `mailserver/mailserver.secret.env` (**gitignored**) y se
reflejan en `config/sasl_passwd` (texthash, también gitignored).

```bash
# Verificar que el relay está configurado
docker exec mailserver postconf relayhost                 # → [smtp.mailersend.net]:587
docker exec mailserver grep mailersend /etc/postfix/sasl_passwd

# Confirmar un envío real (status=sent) tras mandar un correo de prueba
docker exec mailserver grep 'relay=smtp.mailersend.net' /var/log/mail/mail.log | tail

# Rotar credenciales (cuando MailerSend regenere usuario/password):
#   1) editar mailserver/mailserver.secret.env  (RELAY_USER / RELAY_PASSWORD)
#   2) editar mailserver/config/sasl_passwd      ([smtp.mailersend.net]:587  USER:PASS)
cd /opt/proyectos/rtb/mailserver && docker compose up -d mailserver
docker exec mailserver postqueue -f                       # reintenta lo diferido en cola
```

> Síntoma de credencial inválida: `status=deferred (SASL authentication failed; 535 ...)` en el log
> y el correo se acumula en `mailq`. Tras corregir y `postqueue -f`, sale solo.

### Webmail (Roundcube)

Webmail en `https://mail.refacrtb.com.mx` (contenedor `roundcube` en el stack `docker/`, BD SQLite,
servido vía nginx). No toca al contenedor `mailserver`; se conecta por el hostname público
(IMAPS 993 + submission 587).

```bash
# Estado / logs
docker ps --filter name=roundcube
docker logs roundcube --tail 50

# Recrear / actualizar
cd /opt/proyectos/rtb/docker && docker compose up -d roundcube
docker exec rtb_web nginx -t && docker exec rtb_web nginx -s reload
```

## Nextcloud

```bash
# Modo mantenimiento
docker exec -u www-data nextcloud php occ maintenance:mode --on
docker exec -u www-data nextcloud php occ maintenance:mode --off

# Reparar/optimizar tras subir versión
docker exec -u www-data nextcloud php occ upgrade
docker exec -u www-data nextcloud php occ db:add-missing-indices
docker exec -u www-data nextcloud php occ files:scan --all

# Crear usuario
docker exec -u www-data -ti nextcloud php occ user:add nombreusuario
```

### Pestaña Servidor — panel de infraestructura (2026-06-12)

Accesible desde el panel admin (`/admin/` → pestaña 🖥️ Servidor). Visible para ambos roles; acciones destructivas solo para `admin`.

| Sección | Qué muestra / permite |
|---|---|
| **Métricas del host** | CPU (núcleos, modelo), carga 1/5/15 min, RAM usada/total, swap (aviso si = 0), disco `/`, uptime |
| **Contenedores Docker** | Los 8 contenedores con estado, CPU%, RAM, botones Iniciar / Reiniciar / Detener por fila |
| **Backend PM2** | Estado de `rtb_backend`: cpu, mem, uptime, reinicios; botón Reiniciar (responde antes de ejecutar el restart) |
| **Fail2ban** | Jails del contenedor `mailserver` con fallidos, baneados actuales, total y lista de IPs baneadas |
| **Visor de logs** | Tail de 300 líneas o streaming en vivo (SSE) de cualquiera de los 8 contenedores |

Todas las acciones quedan registradas en `audit-log.jsonl` con el usuario real y el nombre del contenedor.

Los contenedores permitidos son exactamente: `rtb_web`, `nextcloud`, `postgres`, `redis`, `collabora`, `roundcube`, `portainer`, `mailserver`.

> **Nota sobre `rtb_web`:** detenerlo o reiniciarlo interrumpe el acceso web y al propio panel — el panel avisa con `confirm()` y vuelve solo cuando el contenedor sube.

Backend: `routes/serverOpsRoutes.js` montado en `/api/admin/system`. Parsers de sistema en `utils/systemExec.js`. Tests: `node web/RTB_Web/backend/test/systemExec.test.js`.

---

## Backend Node (PM2)

```bash
pm2 list
pm2 restart rtb_backend
pm2 stop rtb_backend
pm2 start rtb_backend
pm2 save                                         # persiste tras reboot
pm2 logs rtb_backend --lines 50

# Si rtb_backend muere y no resucita
cd /opt/proyectos/rtb/web/RTB_Web/backend
pm2 start server.js --name rtb_backend
pm2 save
```

## API Python (api_rtb)

**Estado (2026-06-11): eliminado** — contenedor e imagen borrados. El endpoint `POST /api/contacto` lo cubre el backend Node. Ver MEJORAS.md O2.

## Certificados Let's Encrypt

```bash
# Renovación manual (debe correr ya como cron)
sudo certbot renew

# Forzar renovación de un dominio
sudo certbot renew --cert-name www.refacrtb.com.mx --force-renewal

# Tras renovar, recargar nginx
docker exec rtb_web nginx -s reload
```

## Reiniciar servicios

```bash
# Un solo contenedor
docker restart rtb_web
docker restart nextcloud
docker restart mailserver

# Stack completo del proyecto
cd /opt/proyectos/rtb/docker && docker compose restart

# Mailserver (stack propio)
cd /opt/proyectos/rtb/mailserver && docker compose restart
```

## Backup (manual, ad-hoc)

Mientras no exista una solución automatizada (ver MEJORAS.md):

```bash
# Datos críticos a respaldar
sudo tar czf /tmp/backup-mail-$(date +%F).tar.gz /opt/proyectos/rtb/mailserver/mail-data
sudo tar czf /tmp/backup-mailstate-$(date +%F).tar.gz /opt/proyectos/rtb/mailserver/mail-state
sudo tar czf /tmp/backup-nextcloud-$(date +%F).tar.gz /opt/proyectos/rtb/nextcloud/data

# Postgres
docker exec postgres pg_dumpall -U admin > /tmp/backup-postgres-$(date +%F).sql

# Configs
sudo tar czf /tmp/backup-config-$(date +%F).tar.gz \
  /opt/proyectos/rtb/docker/docker-compose.yml \
  /opt/proyectos/rtb/web/nginx/default.conf \
  /opt/proyectos/rtb/mailserver/docker-compose.yml \
  /opt/proyectos/rtb/mailserver/mailserver.env \
  /opt/proyectos/rtb/mailserver/config \
  /opt/proyectos/rtb/mailserver/fail2ban
```

## Red: backend Node ↔ nginx

El `rtb_backend` (Node, PM2) escucha en `0.0.0.0:3000` del host. nginx (contenedor `rtb_web` en la red `rtbnet`, bridge `172.25.0.0/16`) lo proxea desde `/api/`. Dos requisitos no obvios:

1. **`proxy_pass http://172.25.0.1:3000/api/;`** en `nginx/default.conf`. La IP es el **gateway del bridge donde vive `rtb_web`**. La default `172.17.0.1` (docker0) no funciona porque docker0 está DOWN (ningún contenedor usa la red default). Si recreas `rtb_web` en otra red, ajusta esta IP: `docker inspect rtb_web --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}'`.

2. **Regla UFW** abierta para el bridge:
   ```bash
   sudo ufw allow from 172.25.0.0/16 to any port 3000 proto tcp comment 'rtb_backend desde nginx'
   ```
   Sin esto, las conexiones del bridge al puerto 3000 del host quedan filtradas y nginx devuelve 504.

Verificación rápida:
```bash
docker exec rtb_web curl -sf -m 3 http://172.25.0.1:3000/api/status && echo "OK"
```

## Git / acceso SSH a GitHub

El usuario `rtbadmin` tiene una clave SSH (`~/.ssh/id_ed25519`, fingerprint `SHA256:AIp0Q8XAha8p8NRRs6Yg0mQLx6HK/YTZVtKP/WJnOGg`) autorizada en `Churr000God/RTB-Stack-Server`. **Sin passphrase** (regenerada el 2026-06-10 tras perderse la frase de la clave anterior; la clave vieja quedó respaldada como `~/.ssh/id_ed25519.bak.20260610` y su entrada debería retirarse de GitHub).

### Cómo está montado

| Pieza | Ruta | Función |
|---|---|---|
| Servicio systemd user | `~/.config/systemd/user/ssh-agent.service` | Mantiene `ssh-agent` corriendo con socket fijo y lo reinicia si muere |
| Socket fijo | `/run/user/1000/ssh-agent.socket` | Path conocido, no aleatorio por sesión |
| Export en shell | `~/.bashrc` → `SSH_AUTH_SOCK=…` | Cada terminal nueva ve el agente automáticamente |
| Config SSH | `~/.ssh/config` con `AddKeysToAgent yes` | Si el agente está vacío, carga la clave al primer uso |
| Linger | `loginctl enable-linger rtbadmin` | El servicio sobrevive aunque se cierren todas las sesiones |

### Operación diaria

```bash
# Estado del agente y claves cargadas
systemctl --user status ssh-agent.service
ssh-add -l

# Probar autenticación contra GitHub
ssh -T git@github.com   # debe responder "Hi Churr000God!..."

# Pull/push normales
cd /opt/proyectos/rtb && git pull
cd /opt/proyectos/rtb && git push
```

### Passphrase

La clave actual **no tiene passphrase**, así que `git pull/push` funcionan sin pedir nada (no
depende del agente). Si en el futuro se le añade passphrase (`ssh-keygen -p -f ~/.ssh/id_ed25519`),
vuelve a aplicar el flujo del agente: tras un reboot la primera operación la pedirá una vez
(`AddKeysToAgent yes`) o se fuerza con `ssh-add ~/.ssh/id_ed25519`.

### Si deja de funcionar

```bash
# Reiniciar el agente
systemctl --user restart ssh-agent.service
ssh-add ~/.ssh/id_ed25519

# Si SSH_AUTH_SOCK está vacío en una shell nueva, recargar bashrc
source ~/.bashrc
```

## Certificados TLS (Certbot)

Certbot corre en el **host** (no en Docker). Renovación automática vía `certbot.timer`
(systemd, dos veces al día) → `certbot.service` → `certbot -q renew`.

```bash
sudo certbot certificates                          # vigencia real de todos los certs
systemctl list-timers certbot.timer                # confirma que el timer sigue vivo
echo | openssl s_client -servername <host> -connect <host>:443 | openssl x509 -noout -dates -subject
```

**Importante:** nginx sirve desde el contenedor `rtb_web`, con `/etc/letsencrypt` montado `ro`.
El contenedor **no relee los certificados solo** — necesita `docker exec rtb_web nginx -s reload`.
Desde el 23-sep-2026 existe un deploy-hook que lo hace automático:

```
/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh   # docker exec rtb_web nginx -s reload
```

Certbot ejecuta todos los scripts de `renewal-hooks/deploy/` tras cualquier renovación exitosa,
de cualquier dominio — no hace falta declararlo por certificado.

Config real de nginx (vhosts, `server_name`, certificados por dominio):
`/opt/proyectos/rtb/web/nginx/default.conf` (montada en `rtb_web:/etc/nginx/conf.d/default.conf`,
`ro`). El directorio es de `root`; el archivo `default.conf` es de `rtbadmin` (editable sin sudo,
pero sin poder crear archivos nuevos al lado, p. ej. para backup con timestamp).

Ver RTB-TIN-16 (bóveda Nextcloud Sistemas) para el incidente del 23-sep-2026: dominio apex
(`refacrtb.com.mx` sin `www`) sin certificado propio, y falta de este deploy-hook.

## Troubleshooting frecuente

### "No me puedo conectar al correo desde Thunderbird/Outlook"

1. Verificar que `mail.refacrtb.com.mx` resuelve: `dig +short mail.refacrtb.com.mx`
2. Verificar que tu IP no esté baneada:
   ```bash
   docker exec mailserver fail2ban-client status dovecot
   docker exec mailserver fail2ban-client status postfix-sasl
   ```
3. Si tu IP aparece, desbanéala (ver §Fail2ban).
4. Si no aparece y aún hay timeout, probar desde otra red (4G del móvil). Si funciona ahí → bloqueo del ISP local.

### "El sitio web está caído"

1. `docker logs rtb_web --tail 20`
2. `curl -kI https://www.refacrtb.com.mx`
3. Si nginx OK pero `/api/` falla → revisar `pm2 list` y `pm2 logs rtb_backend`.

### "El navegador marca el certificado como vencido/inválido"

**No asumir expiración.** Antes que nada: `sudo certbot certificates`. Si sigue vigente, es casi
seguro uno de estos dos (ver RTB-TIN-16):

1. El host visitado no está en el SAN del certificado que nginx le sirve (p. ej. entrar sin
   `www.`) → agregar el dominio al `server_name` correcto y expandir/emitir el certificado que
   lo cubra.
2. Certbot renovó pero nginx nunca se recargó → revisar que
   `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` exista y sea ejecutable; si no,
   `docker exec rtb_web nginx -s reload` a mano resuelve el síntoma inmediato.

### "Nextcloud lento o no responde"

1. `docker logs nextcloud --tail 50`
2. `docker exec postgres pg_isready -U admin -d nextcloud`
3. Revisar I/O: `iotop` o `iostat -x 2 5`.
4. `df -h /` (Nextcloud + correo crecen: el disco tiene 48% usado pero `/opt/proyectos/rtb` ya pesa 16 GB).

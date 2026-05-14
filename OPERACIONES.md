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
- Acciones disponibles: listar (con cuota usada y estado), crear, cambiar contraseña, definir cuota, vaciar correos, suspender/reactivar, eliminar.
- Autenticación: contraseña única de admin (hash en `web/RTB_Web/backend/.env`).
- Sesión: cookie httpOnly, expira a las 4 h de inactividad. Tras 5 intentos fallidos en 15 min se bloquea la IP.
- Para rotar la contraseña del panel, regenerar el hash bcrypt y reemplazar `ADMIN_PASSWORD_HASH` en `.env`, luego `pm2 restart rtb_backend`.

**Notas sobre el comportamiento:**

- **Suspender** cambia la contraseña a una aleatoria y marca el buzón como `Suspendida` (estado guardado en `backend/data/mailbox-state.json`). El correo se preserva. **Reactivar** pide una contraseña nueva.
- **Vaciar buzón** ejecuta `doveadm expunge -u <email> mailbox '*' all`: borra todos los correos en cualquier carpeta (INBOX, Sent, Drafts, Trash, etc.). Mantiene la estructura de carpetas y la cuenta activa. **Irreversible**.
- **Cuota**: acepta sufijos `K`, `M`, `G`. Vacío o `0` = sin límite. Tras cambiarla, hay ~2 s de propagación hasta que `setup email list` la refleja; el panel hace doble refresh para mostrarla.
- **Eliminar** borra el buzón **y todo su correo**. Doble confirmación tipeando el email. Si la cuenta es muy nueva (sin maildir creado aún), el backend pre-crea el directorio y reintenta automáticamente.

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

```bash
# Diagnóstico rápido del crash actual
docker logs api_rtb --tail 5

# Reconstruir si se modifica el Dockerfile
cd /opt/proyectos/rtb/api
docker build -t docker-api .
docker restart api_rtb
```

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

El usuario `rtbadmin` tiene una clave SSH (`~/.ssh/id_ed25519`, fingerprint `SHA256:aDPLhNGrEEL/iehPYpzcThlJyeoq7s3Qr/SufhYkl8s`) autorizada en `Churr000God/RTB-Stack-Server` como **RTB-Stack-Server**. La clave tiene passphrase.

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

### Cuándo se pide el passphrase

- **Después de un reboot**: el agente arranca vacío. La primera operación SSH/git pedirá el passphrase una vez (gracias a `AddKeysToAgent yes`) y queda cargado hasta el próximo reinicio.
- **Forzar carga manual** si hace falta:
  ```bash
  ssh-add ~/.ssh/id_ed25519
  ```

### Si deja de funcionar

```bash
# Reiniciar el agente
systemctl --user restart ssh-agent.service
ssh-add ~/.ssh/id_ed25519

# Si SSH_AUTH_SOCK está vacío en una shell nueva, recargar bashrc
source ~/.bashrc
```

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

### "Nextcloud lento o no responde"

1. `docker logs nextcloud --tail 50`
2. `docker exec postgres pg_isready -U admin -d nextcloud`
3. Revisar I/O: `iotop` o `iostat -x 2 5`.
4. `df -h /` (Nextcloud + correo crecen: el disco tiene 48% usado pero `/opt/proyectos/rtb` ya pesa 16 GB).

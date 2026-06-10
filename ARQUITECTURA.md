# Arquitectura — Servidor RTB

Documento técnico de los componentes desplegados en `217.154.101.174` (IONOS, Madrid).

## Diagrama general

```
                       ┌──────────────────────────────────┐
                       │  Internet (solo IPv4 al server)  │
                       └──────────────┬───────────────────┘
                                      │
                                      ▼
              ┌──────────────────────────────────────────────┐
              │  nginx (rtb_web) :80/:443  ── red rtbnet     │
              │   ├── www.refacrtb.com.mx   → estático       │
              │   ├── nube.refacrtb.com.mx  → nextcloud:80   │
              │   ├── office.refacrtb.com.mx → collabora:9980│
              │   ├── mail.refacrtb.com.mx → roundcube:80    │
              │   └── /api/                 → 172.17.0.1:3000│
              └──────────────────────────────────────────────┘
                       │            │              │
                       ▼            ▼              ▼
                ┌──────────┐ ┌────────────┐ ┌──────────────┐
                │ Nextcloud│ │  Collabora │ │ rtb_backend  │
                │  (Apache)│ │   :9980    │ │ (Node, PM2)  │
                └─────┬────┘ └────────────┘ │  :3000 host  │
                      │                     └──────┬───────┘
                      ▼                            │ WebDAV
                ┌──────────┐                       │
                │ postgres │                       │
                │   :5432  │ ◄─────────────────────┘
                └──────────┘  (mismo host)


              ┌──────────────────────────────────────────────┐
              │   mailserver (docker-mailserver) :25/587/993 │
              │   red: mailserver_default (aislada)          │
              │   relay saliente → smtp.mailersend.net:587   │
              └──────────────────────────────────────────────┘
                       ▲ IMAPS 993 + submission 587
                       │ (por hostname público mail.refacrtb.com.mx)
              ┌──────────────────────────────────────────────┐
              │   roundcube (webmail) :80 ── red rtbnet       │
              │   mail.refacrtb.com.mx (solo vía nginx)       │
              └──────────────────────────────────────────────┘

              ┌──────────────────────────────────────────────┐
              │  Otros: portainer :9443, onlyoffice :8080    │
              │  (no enrutados por nginx actualmente)        │
              └──────────────────────────────────────────────┘
```

## Inventario de contenedores

| Contenedor | Imagen | Red | Restart | Estado |
|---|---|---|---|---|
| `rtb_web` | `nginx:latest` | rtbnet | unless-stopped | reverse proxy + TLS |
| `nextcloud` | `nextcloud` | rtbnet | unless-stopped | nube privada |
| `postgres` | `postgres:15` | rtbnet | unless-stopped | BD de Nextcloud |
| `collabora` | `collabora/code` | rtbnet | unless-stopped | edición documentos |
| `roundcube` | `roundcube/roundcubemail:latest-apache` | rtbnet | unless-stopped | webmail (SQLite) en `mail.refacrtb.com.mx` |
| `onlyoffice` | `onlyoffice/documentserver` | rtbnet | **no** | sin uso documentado |
| `portainer` | `portainer/portainer-ce` | rtbnet | unless-stopped | gestión Docker |
| `mailserver` | `mailserver/docker-mailserver` | mailserver_default | always | correo |
| `api_rtb` | `docker-api` (local) | docker_default | always | **⚠️ crash-loop, ver §Problemas** |

## Estructura de directorios

```
/opt/proyectos/rtb/
├── docker/                  → docker-compose del stack web+nextcloud+postgres+collabora+portainer
│   └── docker-compose.yml
├── mailserver/              → 8.6 GB
│   ├── docker-compose.yml
│   ├── mailserver.env       → variables (sin secretos; el relay vive en mailserver.secret.env)
│   ├── mailserver.secret.env → RELAY_USER/RELAY_PASSWORD de MailerSend (gitignored)
│   ├── config/              → cuentas, postfix-accounts.cf, sasl_passwd
│   ├── mail-data/           → buzones de los usuarios (refacrtb.com.mx)
│   ├── mail-state/          → estado runtime (fail2ban, spamassassin, postfix queue)
│   └── fail2ban/jail.local  → política de bans
├── nextcloud/               → 1.5 GB
│   └── data/                → archivos de los usuarios (PROPFIND vía WebDAV)
├── db/data/                 → datos de PostgreSQL (Nextcloud)
├── web/                     → 67 MB
│   ├── docker-compose.yml   → variante alterna para nginx (NO se usa actualmente)
│   ├── nginx/default.conf   → configuración vhost de producción
│   └── RTB_Web/
│       ├── frontend/        → sitio estático servido por nginx
│       ├── backend/         → Node.js (Express), corre en PM2 fuera de Docker
│       │   ├── server.js
│       │   ├── routes/      → contactRoutes.js (productos y chatbot vacíos)
│       │   ├── controllers/ → contactController.js (genera PDF + sube a Nextcloud)
│       │   └── utils/pdfGenerator.js (Puppeteer)
│       └── database/        → schema.sql y seed.js (vacíos)
├── api/                     → API FastAPI alternativa (no se usa, ver §Problemas)
├── app/                     → boilerplate React (sin uso aparente)
├── admin/  finanzas/  logistica/  ventas/  nube/  → vacíos
└── .git/                    → un único commit "Initial commit: server structure"
```

## Componente web (nginx + frontend + backend)

- **Frontend**: HTML/CSS estático en `web/RTB_Web/frontend/`, montado read-only en `rtb_web` y servido en `/`.
- **Backend**: Express 5 corriendo bajo **PM2 nativo** (no en Docker) con PID 3990897, namespace `default`, proceso `rtb_backend`. Escucha en `:3000` del host. nginx hace `proxy_pass http://172.17.0.1:3000/api/` (gateway de Docker → host).
- **Endpoint público**:
  - `POST /api/contacto` — recibe formulario, genera PDF con Puppeteer y lo sube a Nextcloud vía WebDAV usando credenciales de `process.env.NEXTCLOUD_*` (que no están establecidas en `.env` actual — el upload se omite silenciosamente).

## Componente correo

- **docker-mailserver** (Postfix + Dovecot + Amavis + ClamAV + SpamAssassin + fail2ban) en contenedor único.
- **TLS**: Let's Encrypt en `/etc/letsencrypt`, montado read-only.
- **Recepción**: puertos 25 (SMTP), 587 (submission), 993 (IMAPS) expuestos al exterior.
- **Salida**: relay a `smtp.mailersend.net:587`. **Funcionando y verificado (2026-06-10)** —
  primera entrega real `status=sent` tras corregir credenciales. El **envío directo MX→MX por el :25
  NO es viable**: IONOS filtra el egress al 25 aguas arriba (587/443 sí salen). Config en dos capas:
  - `RELAY_HOST=smtp.mailersend.net` + `relayhost_map` → relay por remitente `@refacrtb.com.mx`.
  - `DEFAULT_RELAY_HOST=[smtp.mailersend.net]:587` → **fallback global** para remitentes sin match
    (bounces `<>`, `root@`), para que tampoco intenten salir por el :25 bloqueado.
  - Credenciales (`RELAY_USER`/`RELAY_PASSWORD`) en `mailserver.secret.env` (gitignored) +
    `config/sasl_passwd` (gitignored). Rotación: ver `OPERACIONES.md`.
- **Webmail**: `roundcube` (contenedor aparte en `rtbnet`, BD SQLite) servido en
  `https://mail.refacrtb.com.mx` vía nginx; habla con el correo por el hostname público
  (IMAPS 993 + submission 587). No toca al contenedor `mailserver`.
- **Cuentas** (12 buzones): `contacto`, `ventas`, `finanzas`, `facturacion`, `almacen`, `recursos_humanos`, `sistemas`, `asistente`, `productos_especiales`, `gerente_general`, `angel_badmon`, `tbadillob`. Total ~8 GB.
- **fail2ban**: `bantime=1w`, `maxretry=6`, `findtime=1w`, `banaction=nftables-allports` (bloquea TODOS los puertos al banear, no solo el afectado — esto causa que parezca caído todo el servidor).
- **DNS**:
  - MX `refacrtb.com.mx → mail.refacrtb.com.mx (10)`
  - A `mail.refacrtb.com.mx → 217.154.101.174`
  - Sin AAAA (no hay IPv6).

## Componente nube (Nextcloud + Collabora + PostgreSQL)

- **Nextcloud** (Apache integrado) escucha en `:80` dentro de la red `rtbnet`. nginx termina TLS y hace proxy.
  - Volumen: `nextcloud/data` (1.5 GB) montado en `/var/www/html`.
  - Trusted domain: `nube.refacrtb.com.mx`.
  - Usuarios activos detectados en logs: `admin`, `Gerente_Finanzas`, `Gerente_G`, `Auxiliar_Administrativa`.
- **PostgreSQL 15**: base `nextcloud` con `admin` / `securepass`. Datos en `db/data`.
- **Collabora**: edita documentos desde Nextcloud. `--o:ssl.enable=false` porque TLS lo termina nginx.
- **OnlyOffice**: corriendo en `:8080` pero NO está enrutado por nginx ni es usado por Nextcloud. Restart policy = `no` (no inicia tras reboot).

## Componente API alternativa (FastAPI)

`api_rtb` está pensado como alternativa al backend Node, pero **actualmente en crash-loop**.

- Imagen: `docker-api` (build local de `/opt/proyectos/rtb/api/Dockerfile`).
- Bind mount: `/opt/proyectos/rtb/api/app` → `/app`.
- Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, etc. (relay vía MailerSend).
- Funcionalidad: `POST /contact` que envía email con `smtplib`.

## Redes Docker

| Red | Uso | Containers |
|---|---|---|
| `rtbnet` | web + nube + colaboración | nginx, nextcloud, postgres, collabora, roundcube, portainer, onlyoffice |
| `mailserver_default` | aislada para correo | mailserver |
| `docker_default` | default | api_rtb (descolgado del resto) |
| `bridge` | sin uso productivo | — |
| `docker_rtbnet` | duplicado de rtbnet | — |

## Procesos fuera de Docker

- **PM2** corriendo `rtb_backend` (Node.js Express), user `rtbadmin`, restart count 30 (ha caído varias veces).
- **certbot** (asumido por `/etc/letsencrypt`).

## Problemas conocidos (al 2026-05-13)

1. **`api_rtb` en crash-loop** — el bind mount `/opt/proyectos/rtb/api/app` está vacío y eclipsa `main.py` que la imagen copia a `/app/`. O se elimina el bind mount, o se mueven los archivos `api/{main.py,email_utils.py}` a `api/app/`.
2. **Secretos en texto plano en docker-compose** — `db/admin/admin123`, `securepass`, `adminpass` en `docker/docker-compose.yml`.
3. **fail2ban `nftables-allports`** — al banear una IP por intentos IMAP fallidos, bloquea ICMP/HTTP/HTTPS también; da falsa impresión de "servidor caído".
4. **Discrepancia entre compose files** — existen 3 docker-compose para nginx (`docker/`, `web/`, `web/RTB_Web/deploy/`) con paths diferentes. Solo `docker/docker-compose.yml` refleja lo que efectivamente corre (pero monta `../web/html` que no existe; el container real fue arrancado a mano con la ruta correcta).
5. **OnlyOffice descolgado** — corre pero no se usa; consume ~500 MB de RAM y 7 volúmenes.
6. **Sin swap** — 16 GB RAM y 0 B de swap; un pico puede tumbar servicios.
7. **Sin IPv6** — clientes IPv6-only no pueden alcanzar el servidor; clientes dual-stack pueden tener latencia adicional por timeout de IPv6.
8. **Carpetas vacías versionadas** — `admin/`, `ventas/`, `finanzas/`, `logistica/`, `nube/`, `app/`, `api/app/` están vacías; ruido en el repo.
9. **`backend/database/schema.sql` y `seed.js` vacíos** — el backend no usa BD, pero los archivos sugieren intención abandonada.
10. **Git con un único commit `Initial commit`** — no hay historial, no hay branching, no hay tags de release.

## Datos sensibles ubicados durante esta exploración (rotar)

> ⚠️ Estos secretos están en el repo o en variables de entorno expuestas. Deben rotarse.

- `docker/docker-compose.yml`: `NEXTCLOUD_ADMIN_PASSWORD=admin123`, `POSTGRES_PASSWORD=securepass`, Collabora `password=adminpass`.
- `mailserver/mailserver.secret.env`: `RELAY_USER`/`RELAY_PASSWORD` de MailerSend — **gitignored**
  (extraídos de `mailserver.env` el 2026-06-10 para no versionar el secreto).
- `api_rtb` env: `SMTP_PASS=mssp.eM9xYbz.z86org8m09klew13.xzpMn5H` (clave de MailerSend).
- Credenciales de `sistemas@refacrtb.com.mx` y la API key de MailerSend fueron compartidas en chats — considerarlas comprometidas.

Ver **[MEJORAS.md](MEJORAS.md)** para plan de acción.

# Inventario maestro — RTB (`refacrtb.com.mx`)

> Auditoría de infraestructura · **solo lectura** · 2026-06-09
> Servidor único IONOS (Madrid) · `217.154.101.174` · Ubuntu 22.04.5 LTS · 16 GB RAM · disco 466 GB (51 % usado)
> Uptime: 322 días (sin reinicio) · kernel en uso `5.15.0-144` · **0 swap**

## 1. Sistema base

| Recurso | Valor |
|---|---|
| OS | Ubuntu 22.04.5 LTS (jammy) |
| Kernel en uso | 5.15.0-144-generic (instalado hasta `-181`; **reinicio pendiente**) |
| RAM / Swap | 16 GiB / **0** |
| Disco `/` | 466 GB, 234 GB usados (51 %) |
| Updates pendientes | 52 (19 de seguridad) + 11 ESM |
| Firewall | UFW activo, `deny incoming` por defecto |
| Fail2ban | jails: `sshd`, `postfix`, `dovecot` (banaction `iptables-multiport`) |
| Init de servicios | Docker Compose (3 proyectos) + 1 backend Node bajo PM2 |

## 2. Contenedores Docker

| Contenedor | Imagen | Red (IP) | Puertos publicados | Restart | Healthcheck | Estado |
|---|---|---|---|---|---|---|
| `rtb_web` (nginx) | `nginx:latest` | rtbnet (172.25.0.5) | 80, 443 | unless-stopped | NO | OK |
| `nextcloud` | `nextcloud` (v31.0.7) | rtbnet (172.25.0.7) | — (interno :80) | unless-stopped | NO | OK (4.8 GB RAM) |
| `postgres` | `postgres:15` | rtbnet (172.25.0.3) | — (interno :5432) | unless-stopped | NO | OK |
| `collabora` | `collabora/code` | rtbnet (172.25.0.2) | 9980 (bloqueado por UFW) | unless-stopped | NO | OK |
| `portainer` | `portainer/portainer-ce` | rtbnet (172.25.0.4) | **9443 (abierto al mundo)** | unless-stopped | NO | OK |
| `onlyoffice` | `onlyoffice/documentserver` | rtbnet (172.25.0.6) | 8080 (bloqueado por UFW) | **no** | NO | **Zombie** (sin proxy) |
| `mailserver` | `mailserver/docker-mailserver:latest` | mailserver_default (172.18.0.2) | 25, 587, 993 | always | NO | OK (1.8 GB RAM) |
| `api_rtb` | `docker-api` | docker_default | — | always | NO | **Crash-loop** |
| backend Node | PM2 (host) | host → 172.25.0.1:3000 | 3000 (solo desde rtbnet vía UFW) | PM2 | n/a | OK |

**Ninguna** imagen tiene healthcheck. **Ningún** contenedor tiene límite de memoria (`mem=0`). Imágenes sin pin de versión: nginx, nextcloud, collabora, portainer, mailserver, onlyoffice (`:latest` o sin tag). Solo `postgres:15` fijado a major.

## 3. Redes Docker

| Red | Rango | Contenedores | Notas |
|---|---|---|---|
| `rtbnet` (external) | 172.25.0.0/16 | rtb_web, nextcloud, postgres, portainer, collabora, onlyoffice | **Red plana**: nginx (cara a internet) comparte L2 con postgres y con portainer (que monta `docker.sock`) |
| `mailserver_default` | 172.18.0.0/16 | mailserver | Aislado ✓ |
| `docker_default` | — | api_rtb | Aislado (módulo muerto) |
| `docker_rtbnet`, `bridge`, `none` | — | — | Sin uso / por defecto |

## 4. Subdominios → servicio (routing real en nginx vivo)

| Subdominio | DNS A | Cert LE (vence) | Server block nginx | Destino | Estado |
|---|---|---|---|---|---|
| `www.refacrtb.com.mx` | 217.154.101.174 | ✓ 2026-08-08 | ✓ | static + `/api/` → `172.25.0.1:3000` (Node) | OK |
| `nube.refacrtb.com.mx` | 217.154.101.174 | ✓ 2026-08-08 | ✓ | → `nextcloud:80` | OK |
| `office.refacrtb.com.mx` | 217.154.101.174 | ✓ (SAN de nube) | ✓ | → `collabora:9980` | OK |
| `mail.refacrtb.com.mx` | 217.154.101.174 | ✓ 2026-08-08 | — (no necesita; es host SMTP/IMAP + MX) | mailserver | OK |
| `app.refacrtb.com.mx` | 217.154.101.174 | ✓ 2026-08-08 | **❌ ninguno** | (onlyoffice no proxiado) | **Huérfano** |
| `api.refacrtb.com.mx` | 217.154.101.174 | ✓ 2026-08-08 | **❌ ninguno** | (api_rtb en crash-loop) | **Huérfano** |

Certs: **6 individuales** (no wildcard), todos renovados 2026-05-10, válidos hasta 2026-08-08. Renovación automática vía `certbot.timer` (activo).

## 5. Correo

| Aspecto | Valor | Estado |
|---|---|---|
| MX | `10 mail.refacrtb.com.mx` | OK |
| Cola (`mailq`) | vacía | OK |
| Open relay | **NO** — `smtpd_relay_restrictions = permit_mynetworks permit_sasl_authenticated defer_unauth_destination` | OK ✓ |
| TLS | entrante `may`, saliente `encrypt` | OK |
| Salida | **relay vía MailerSend** (`relayhost_map: @refacrtb.com.mx [smtp.mailersend.net]`) | OK |
| SPF | `v=spf1 include:spf.brevo.com include:_spf.mailersend.net ~all` (coherente con relay; la IP propia NO está y no hace falta) | OK |
| DMARC | `p=reject; rua=mailto:dmarc_rua@onsecureserver.net` (RUA es buzón genérico de IONOS, no del dominio) | Menor |
| DKIM | sin clave en selector `mail._domainkey` (firma la hace MailerSend con su selector) | Revisar |
| PTR (rDNS) | `ip217.154.101-174.pbiaas.com` (genérico IONOS, no `mail.refacrtb.com.mx`) | Menor (mitigado por relay) |
| `mynetworks` | incluye `172.16.0.0/12` (todo Docker) | Menor |

## 6. Accesos / usuarios

| Usuario | UID | Shell | Grupos | SSH keys |
|---|---|---|---|---|
| `root` | 0 | bash | — | (login deshabilitado) |
| `rtbadmin` | 1000 | bash | sudo, **docker**, NOPASSWD:ALL | 1 |
| `diegoadmin1` | 1001 | bash | sudo | 1 |
| `diegoadmin2` | 1002 | bash | sudo | 1 |

- SSH: puerto 22 abierto al mundo, `PermitRootLogin no` ✓, **`PasswordAuthentication yes`** ⚠️, `PubkeyAuthentication yes`.
- Logins recientes: solo `rtbadmin` desde IPs MX (Telmex). Sin logins de root. fail2ban-sshd: 16 baneadas, 94 intentos fallidos.

## 7. Backups (Fase 0)

| Qué | Estado |
|---|---|
| `/opt/backups/mailserver/` | Copia **única de 2025-07-25**, ~8 MB, maildirs prácticamente **vacíos** (solo estructura). |
| Nextcloud (`nextcloud/data`, ~varios GB) | **Sin backup** |
| Postgres (BD nextcloud) | **Sin dump** |
| Configs (`/etc`, compose, volúmenes) | **Sin backup sistemático** |
| Automatización (cron/timer de backup) | **No existe** |
| Snapshot VPS IONOS | **Por confirmar en panel IONOS** (no verificable desde el host) |

## 8. Git / repo

- Repo `.git` = **228 MB**; **30,207 archivos** trackeados, de los cuales **30,063** son `docker/nextcloud/data/` (copia obsoleta del código de Nextcloud — no es el `config.php` vivo, que sí está en `.gitignore`).
- `docker/docker-compose.yml` con **secretos en claro** está trackeado y en el historial (commit inicial `90e2626c`): `NEXTCLOUD_ADMIN_PASSWORD=<redactado>`, `POSTGRES_PASSWORD=<redactado>`, Collabora `<redactado>`.
- `.gitignore` cubre datos vivos (`mailserver/mail-data`, `nextcloud/data`, `db/data`, `sasl_passwd`, backend `.env`) pero **no** `docker/nextcloud/data/`.

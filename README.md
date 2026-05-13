# RTB — Refacciones Tomás Badillo

Servidor de infraestructura para Refacciones Tomás Badillo S.A. de C.V. Aloja el sitio público, la nube privada con Nextcloud + Collabora, el servidor de correo `@refacrtb.com.mx`, y una API de formulario de contacto.

## Servicios expuestos

| Dominio | Servicio | Puerto público |
|---|---|---|
| www.refacrtb.com.mx | Sitio institucional (HTML estático) | 443 |
| nube.refacrtb.com.mx | Nextcloud (almacenamiento + colaboración) | 443 |
| office.refacrtb.com.mx | Collabora Online (edición de documentos) | 443 |
| mail.refacrtb.com.mx | Servidor de correo (IMAP/SMTP) | 25, 587, 993 |
| portainer.* (vía IP) | Gestor de Docker | 9443 |

## Documentación

- **[ARQUITECTURA.md](ARQUITECTURA.md)** — descripción técnica de cada componente, redes, volúmenes y flujos.
- **[OPERACIONES.md](OPERACIONES.md)** — comandos comunes de operación, backup, troubleshooting.
- **[MEJORAS.md](MEJORAS.md)** — propuestas de mejora priorizadas por impacto.

## Entorno

- Servidor: IONOS (Madrid) — IPv4 `217.154.101.174`
- SO: Ubuntu 22.04.5 LTS
- Docker 28.3.2 / Compose v2.38.2
- 16 GB RAM, 466 GB de disco (48% usado), sin swap
- Sin IPv6 público configurado

## Inicio rápido

```bash
# Estado general
docker ps
pm2 status

# Logs en vivo
docker logs -f mailserver
docker logs -f rtb_web
pm2 logs rtb_backend
```

Despliegue rápido de `rtb_web` (Nginx)

Prerrequisitos
- DNS apuntando los dominios a la IP del servidor:
  - `refacrtb.com.mx`, `www.refacrtb.com.mx`
  - `nube.refacrtb.com.mx`
  - `office.refacrtb.com.mx`
- Docker y Docker Compose instalados.
- Certificados SSL vigentes (Let's Encrypt u otros).
- Contenedores de `nextcloud` y `onlyoffice` existentes en la red externa `rtbnet` (o conéctalos).

Estructura de certificados
- Ubica los certificados en `deploy/certs/<dominio>/` con nombres:
  - `fullchain.pem`
  - `privkey.pem`
- Ejemplos de rutas:
  - `deploy/certs/www.refacrtb.com.mx/fullchain.pem`
  - `deploy/certs/www.refacrtb.com.mx/privkey.pem`
  - `deploy/certs/nube.refacrtb.com.mx/fullchain.pem`
  - `deploy/certs/office.refacrtb.com.mx/privkey.pem`

Cómo desplegar
1) Clona o descarga el repositorio en el servidor.
2) Entra al directorio del proyecto y ejecuta:
   - `bash deploy/deploy.sh`
3) Verifica que el contenedor esté arriba:
   - `docker ps --filter name=rtb_web`
4) Si `nextcloud` u `onlyoffice` no están en `rtbnet`, conéctalos:
   - `docker network create rtbnet` (si no existe)
   - `docker network connect rtbnet nextcloud`
   - `docker network connect rtbnet onlyoffice`

Notas de configuración
- El sitio estático se sirve desde `frontend/` (montado en `/usr/share/nginx/html`).
- El `default.conf` define:
  - Redirección HTTP→HTTPS para los 3 dominios.
  - `www/refacrtb` sirve contenido estático.
  - `nube` hace proxy a `http://nextcloud:80`.
  - `office` hace proxy a `http://onlyoffice:80`.
- Ajusta `deploy/nginx/default.conf` si cambian nombres de servicios.

Solución de problemas
- 404 en el sitio principal: confirma que el contenido existe en `frontend/` y que se montó.
- Error de certificados: valida rutas en `deploy/docker-compose.yml` y permisos de archivos.
- Proxy a Nextcloud/OnlyOffice falla: asegúrate de que los contenedores corran y estén en `rtbnet`.
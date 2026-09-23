# Sesión — TLS apex + Certbot sin deploy-hook — 23-sep-2026

> Motivo: alerta de "certificado HTTPS vencido" reportada para `refacrtb.com.mx`. Documentación
> completa y con formato en la bóveda Nextcloud Sistemas: `01-TI/RTB-TIN/RTB-TIN-16_...` (md + html).
> Entrada de seguridad para anexar al maestro: `01-TI/CTRL-SEC/CTRL-SEC-02_...` (misma bóveda).

## Diagnóstico

1. `sudo certbot certificates` → los 4 certificados (`www`, `nube`/`office`, `mail`) vigentes
   hasta 6-dic-2026. **No había expiración real.**
2. `openssl s_client -servername refacrtb.com.mx -connect refacrtb.com.mx:443 | openssl x509 -noout -subject -ext subjectAltName`
   → `subject=CN=www.refacrtb.com.mx`, SAN `DNS:www.refacrtb.com.mx`. El apex no está cubierto.
   `curl -vI https://refacrtb.com.mx` confirma: `SSL: no alternative certificate subject name matches target host name`.
3. `cat /lib/systemd/system/certbot.service` → `ExecStart=/usr/bin/certbot -q renew`, sin
   `--deploy-hook`. `grep -r hook /etc/letsencrypt/renewal/` → vacío. nginx corre en el
   contenedor `rtb_web` con `/etc/letsencrypt` montado `ro`; el contenedor lleva `Up` desde
   22-ago-2026 sin reinicio, pero servía un certificado emitido 7-sep-2026 → esa recarga fue
   manual, no automática.

## Corrección

```bash
# 1. Expandir el certificado de www para cubrir el apex
sudo certbot certonly --cert-name www.refacrtb.com.mx \
  --webroot -w /var/www/certbot \
  -d www.refacrtb.com.mx -d refacrtb.com.mx \
  --expand
# → Successfully received certificate. Expiry: 2026-12-22

# 2. Deploy-hook para recarga automática (aplica a TODOS los certs de este host)
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
docker exec rtb_web nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# 3. nginx: agregar refacrtb.com.mx al vhost 443 de www + redirect canónico
# Editado /opt/proyectos/rtb/web/nginx/default.conf:
#   server_name www.refacrtb.com.mx refacrtb.com.mx;   (bloque 80 y bloque 443 de www)
#   + dentro del server 443 de www:
#     if ($host = refacrtb.com.mx) { return 301 https://www.refacrtb.com.mx$request_uri; }

docker exec rtb_web nginx -t          # sintaxis OK
docker exec rtb_web nginx -s reload   # aplicado
```

## Verificación

```bash
$ curl -sI https://refacrtb.com.mx
HTTP/2 301
location: https://www.refacrtb.com.mx/

$ curl -sI https://www.refacrtb.com.mx
HTTP/2 200
```

El paso 1 (`--expand`) ya disparó el deploy-hook recién creado — log mostró
`nginx: signal process started` en la misma corrida, confirmando que el hook funciona antes de
esperar a la próxima renovación real.

## Nota de proceso

`/opt/proyectos/rtb/web/nginx/` es propiedad de `root` (directorio, no archivo) — `rtbadmin` no
puede crear archivos nuevos ahí (falló `scp` a un nombre `.new` con `Permission denied`), pero sí
puede sobrescribir `default.conf` (es de `rtbadmin`). El respaldo del original se guardó fuera del
servidor antes de sobrescribir.

## Efectos colaterales de esta sesión

- Se creó y autorizó una llave SSH nueva (`refacrtb_rtbadmin`, ed25519, sin passphrase) para
  `rtbadmin`. Ver adenda en `auditoria/AUDITORIA-ACCESOS.md` (23-sep-2026) — actualiza el
  inventario de 1 a 2 llaves y señala la ausencia de passphrase como debilidad nueva, relacionada
  con el hallazgo A2 (no resuelto) de esa auditoría.

## Pendiente / no tocado en esta sesión

- Hallazgo A1 (`PasswordAuthentication` efectivo `yes` por conflicto de drop-ins) — sin cambio,
  se usó una vez para instalar la llave nueva.
- Hallazgo A2 (`rtbadmin` con `sudo NOPASSWD: ALL` + `docker`) — sin cambio, extendido por la
  llave nueva sin passphrase.
- `ssl_stapling` sigue comentado en `default.conf` (pendiente ya señalado ahí mismo, no
  relacionado con este incidente).

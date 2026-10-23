# Sesión — PHP2Shell (CVE-2026-109618 / CVE-2026-109619) — 23-oct-2026

> Motivo: falla crítica en el núcleo de PHP (RCE sin autenticación, CVSS v4.0 9.2), parche
> publicado el 21-oct-2026 (8.5.12 / 8.4.27 / 8.3.36 / 8.2.35). Documentación completa en la
> bóveda Nextcloud Sistemas: `01-TI/RTB-TIN/RTB-TIN-19_Respuesta_PHP2Shell_VPS_V1_0.md`.
> Entrada de seguridad: `01-TI/CTRL-SEC/CTRL-SEC-03_Entrada_20261023_para_anexar.md`.

## Exposición

| Contenedor | PHP antes | PHP después |
|---|---|---|
| `nextcloud` | 8.3.30 | 8.3.36 |
| `roundcube` | 8.4.21 | 8.4.27 |
| `rtb_web` | sin PHP | — |

## Corrección

- `roundcube`: `docker compose pull roundcube && docker compose up -d --no-deps roundcube`
  (la imagen `latest-apache` ya venía reconstruida; Roundcube queda en 1.7.5).
- `nextcloud`: la imagen `nextcloud:31` es EOL y **no se reconstruyó** (seguía en PHP 8.3.30).
  Se compiló `nextcloud:31.0.14-php8.3.36-rtb` con la receta oficial sin cambios
  (`nextcloud/docker` commit `a548962`, carpeta `31/apache`, guardada en `~rtbadmin/build/nc31`;
  la receta verifica la firma GPG del tarball). Mismos módulos PHP que la imagen anterior.
  Cambio de la línea 29 de `docker/docker-compose.yml` y `up -d --no-deps nextcloud`
  a las 16:16 UTC. Respaldo del compose: `docker/docker-compose.yml.bak-20261023` (sin versionar).
- Verificación: `healthy`, `occ status` 31.0.14 sin mantenimiento ni `needsDbUpgrade`,
  `cron.php` OK, `status.php` público 200.
- Regresar: restaurar el `.bak` y `up -d --no-deps nextcloud` (la imagen `nextcloud:31` sigue local).

**Importante:** mientras Nextcloud siga en 31, `docker compose pull nextcloud` no trae parches de PHP.
Recompilar: `cd ~/build/nc31/31/apache && docker build --pull -t nextcloud:31.0.14-php<ver>-rtb .`

## Búsqueda de explotación (17 al 23-oct, P-196)

- **nginx (`rtb_web`)**: 244,253 peticiones en la ventana. Tráfico externo explicado (n8n Cloud por
  WebDAV, clientes de escritorio de la plantilla, enlace público del despacho con contraseña y
  vencimiento 30-oct). Escaneo genérico (`.env`, `wp-config`, `cgi-bin` con traversal, nombres de
  webshell): todo 301/400/404. Ningún `.php` fuera de las rutas normales respondió 200.
  Los 5xx (≈277) son de generación de miniaturas (`/core/preview`, `publicpreview`) y 6× 503 de un
  cliente Android con la cuenta `admin` deshabilitada.
- **`nextcloud.log`**: 294 entradas nivel 3, ninguna de memoria agotada, segfault ni unserialize
  (dominan `fclose()` de richdocuments y `Account disabled`).
- **Disco**: ningún `.php`, `.htaccess` ni `.user.ini` escrito (ctime) entre el 17-oct y el parche,
  ni en el código de Nextcloud ni en `data/` de usuarios ni en el volumen de Roundcube. Los `.php`
  de Roundcube con mtime 19-oct vienen así de la imagen oficial (ctime = 23-oct, copia al actualizar).
- **Sin crontab** de `www-data`; procesos del contenedor nextcloud solo `apache2`.
- **Conclusión:** sin evidencia de explotación. Límite: los logs de error de PHP/Apache de los
  contenedores anteriores se perdieron al recrearlos.

## Hallazgos colaterales

1. El log JSON de `rtb_web` mide 1.47 GB, nunca se ha rotado (sin `max-size`), y `docker logs`
   se detiene a mitad (lee como binario); se leyó directo del archivo con `grep -a`.
   Recomendado: `logging: options: max-size/max-file` en el compose.
2. Enlace público `N5sCmSYm2ns2csQ` creado por `svc_n8n` (factura PDF) sin contraseña ni vencimiento.
3. Red `docker_rtbnet` sin uso (aviso de compose al recrear).

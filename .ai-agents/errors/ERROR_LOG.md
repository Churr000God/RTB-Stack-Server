# ERROR_LOG — RTB

Registro de errores y su resolución, para no repetir lo ya resuelto. Una entrada por problema.
Formato: fecha · síntoma · causa · resolución · estado (ABIERTO / RESUELTO / MITIGADO).

> Inicializado el 2026-06-09 durante el onboarding. Las entradas ABIERTAS de abajo provienen
> de `ARQUITECTURA.md` / `MEJORAS.md`; aún no se han corregido (fuera del alcance del onboarding).

---

## ABIERTO — `api_rtb` (FastAPI) en crash-loop
- **Síntoma:** el contenedor `api_rtb` reinicia constantemente.
- **Causa:** el bind mount `/opt/proyectos/rtb/api/app` tapa los archivos de la imagen
  (el directorio del host está vacío y eclipsa el código copiado en build).
- **Impacto:** ninguno funcional — el módulo `api/` está **sin uso** (el backend real es Express).
- **Resolución propuesta:** retirar el servicio del compose o quitar el bind mount. Confirmar
  con el dueño antes de tocar. No es prioritario.
- **Estado:** ABIERTO.

## ABIERTO — fail2ban banea todos los puertos
- **Síntoma:** el servidor "parece caído" intermitentemente; clientes legítimos pierden acceso
  a todos los servicios, no solo IMAP.
- **Causa:** jail con acción `nftables-allports` en `mailserver/fail2ban/jail.local` → al banear
  una IP la bloquea en TODOS los puertos.
- **Resolución propuesta:** acotar la acción al puerto del servicio (IMAP/submission) en lugar de
  allports. Requiere `deep-research` sobre la config de docker-mailserver + reinicio del servicio
  (preguntar antes).
- **Estado:** ABIERTO.

## ABIERTO — Secretos en texto plano
- **Síntoma:** contraseñas de Nextcloud/Postgres visibles en `docker/docker-compose.yml`.
- **Resolución propuesta:** mover a `.env` / Docker secrets. Ver `MEJORAS.md`.
- **Estado:** ABIERTO.

## ABIERTO — Sin swap
- **Síntoma:** 16 GB RAM, 0 B swap; un pico de memoria puede tirar contenedores.
- **Resolución propuesta:** crear swapfile. Ver `OPERACIONES.md`/`MEJORAS.md`.
- **Estado:** ABIERTO.

## RESUELTO — `graphify detect` se cuelga sobre la raíz
- **Fecha:** 2026-06-09.
- **Síntoma:** `detect(Path('.'))` consumía 97% CPU varios minutos sin terminar.
- **Causa:** escanea `node_modules/` (backend) y los dirs de datos (`mailserver/mail-data` ~8 GB,
  `nextcloud/data`). No respeta `.gitignore`.
- **Resolución:** construir el grafo solo sobre las carpetas de fuente
  (`web/RTB_Web/{backend,frontend}`, `api/`), excluyendo `node_modules` y `*/data/`. AST-only.
- **Estado:** RESUELTO. Regla anotada en `CLAUDE.md` y `AGENTS.md`.

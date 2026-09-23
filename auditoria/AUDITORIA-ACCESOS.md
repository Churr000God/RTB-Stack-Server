# Auditoría de accesos — usuarios, permisos y vías de conexión

> 2026-06-09 · **solo lectura** (no se modificó ningún estado) · marca: 🔴 crítico / 🟠 medio / 🟡 menor
> Esfuerzo: **B**ajo / **M**edio / **A**lto
> Anexo dedicado de [AUDITORIA.md](AUDITORIA.md). Profundiza la sección 6 de [INVENTARIO.md](INVENTARIO.md).
> Alcance: identidad y control de acceso al **sistema operativo** (cuentas, grupos, sudo, SSH, login,
> fail2ban, cron/timers, docker como vector root-equivalente). Las identidades de aplicación
> (Nextcloud, correo, Postgres, panel) sólo se listan al final (§7) y se enlazan.

## Resumen ejecutivo

El control de acceso del host es **funcional pero gira en torno a un único superusuario omnipotente**.
La cuenta `rtbadmin` concentra: login SSH + `sudo NOPASSWD: ALL` + pertenencia al grupo `docker`
(= root del host sin contraseña). Es un **punto único de fallo**: si se secuestra una sesión o llave de
`rtbadmin`, se obtiene root total sin ninguna barrera intermedia. Las defensas de perímetro son correctas
(UFW deny-by-default, root SSH interactivo deshabilitado, fail2ban activo, llaves públicas, llave de backup
fuertemente restringida), pero hay tres debilidades concretas y baratas de corregir:

1. **SSH acepta contraseñas pese a la intención de no hacerlo.** El `sshd_config` principal declara
   `PasswordAuthentication no`, pero un drop-in de cloud-init (`50-cloud-init.conf`) lo **anula a `yes`**
   por orden de lectura. En efecto, con el puerto 22 abierto al mundo y >24 000 intentos de fuerza bruta
   registrados, las cuentas son atacables por contraseña.
2. **Dos cuentas administrativas inactivas** (`diegoadmin1`, `diegoadmin2`; último login ago/oct 2025)
   siguen con `sudo` y acceso SSH — superficie de ataque sin uso.
3. **Puertos de gestión Docker expuestos a internet eludiendo UFW** (Portainer 9443 con `docker.sock`,
   Collabora 9980, OnlyOffice 8080), porque Docker inserta sus reglas DNAT por debajo de UFW.

Ninguno de estos requiere más de unos minutos de cambio; el riesgo está en que hoy conviven un único
superusuario, password-auth de facto activa y un panel de control total de Docker en internet.

## Inventario de identidades del SO

Cuentas con shell de login (el resto, 34 cuentas de sistema, tienen `nologin`/`false` y nunca han entrado):

| Usuario | UID | Grupos relevantes | Contraseña | Caduca | Llaves SSH | Último login | sudo | NOPASSWD | docker |
|---|---|---|---|---|---|---|---|---|---|
| `root` | 0 | root | **L** (bloqueada ✅ A8) | nunca | 1 (restringida) | 22-jul-2025¹ | (es root) | — | — |
| `rtbadmin` | 1000 | sudo, **docker** | P (activa) | nunca | 1 (RSA-4096) | **9-jun-2026 (hoy)** | ✅ | **✅ ALL** | ✅ |
| `diegoadmin1` | 1001 | sudo | **L + expirada** (✅ A3) | 1970-01-02 | 1 (ed25519) | 22-ago-2025 | ✅ | ❌ | ❌ |
| `diegoadmin2` | 1002 | sudo | **L + expirada** (✅ A3) | 1970-01-02 | 1 (ed25519) | 23-oct-2025 | ✅ | ❌ | ❌ |

¹ `root` sólo registró login el día de creación del servidor (cloud-init); desde entonces, ningún login
interactivo. Su único acceso vivo es la llave de backup con comando forzado (ver §C).

> **Nota de trazabilidad:** las 3 cuentas personales (`rtbadmin`, `diegoadmin1`, `diegoadmin2`) tienen el
> **mismo titular** en el GECOS ("Diego Hermilo Guillen Garcia"). No representan 3 personas distintas, sino
> una sola con 3 identidades — no aportan trazabilidad nominal y multiplican la superficie.

## Matriz riesgo × esfuerzo

| # | Hallazgo | Área | Riesgo | Esf. | Acción |
|---|---|---|---|---|---|
| A1 | `PasswordAuthentication` efectivo = **yes**: `50-cloud-init.conf` anula el `no` del config principal; :22 abierto al mundo + >24k intentos de fuerza bruta | C · SSH | 🟠 | B | Hacer ganar el `no`: borrar/editar la línea `yes` de `50-cloud-init.conf` o añadir un drop-in de orden menor (p.ej. `00-hardening.conf`); luego `sshd -t` y `systemctl reload ssh`. Verificar sesión nueva antes de cerrar la actual |
| A2 | `rtbadmin` con `sudo NOPASSWD: ALL` + grupo `docker` = **punto único de fallo** (root del host sin barrera) | B · sudo | 🟠 | B | Quitar `NOPASSWD` (exigir contraseña en sudo) o acotarlo a los comandos que el backend realmente invoca; valorar separar la cuenta de operación de la de administración |
| A3 | `diegoadmin1`/`diegoadmin2` **inactivas** (último login ago/oct 2025) con sudo + SSH | A · Cuentas | 🟠 | B | ✅ **RESUELTO 2026-06-09**: `usermod -L -e 1` en ambas (bloqueadas + expiradas a 1970-01-02). Reversible con `usermod -U -e ''` |
| A4 | SSH **sin `AllowUsers`/`AllowGroups`**: cualquier cuenta con shell es objetivo de login remoto | C · SSH | 🟡 | B | Añadir `AllowUsers rtbadmin` (o `AllowGroups sudo`) en un drop-in; reduce la superficie a las cuentas previstas |
| A5 | Puertos de gestión Docker **expuestos a internet eludiendo UFW** (9443 Portainer, 9980 Collabora, 8080 OnlyOffice en `0.0.0.0`) | C · Red/acceso | 🟠 | B–M | Bindear a `127.0.0.1` en los `ports:` del compose (`127.0.0.1:9980:9980`) y publicar vía nginx; o filtrar en la cadena `DOCKER-USER`. Cruza con [AUDITORIA.md](AUDITORIA.md) #5 y #7 |
| A6 | Portainer monta `docker.sock` y está en 9443 al mundo → control total de Docker (= root host) desde internet, sólo tras su login | E · Vector | 🟠 | B | Cerrar 9443 al exterior; acceder por túnel SSH (`ssh -L 9443:localhost:9443`) o VPN. Ya señalado en [AUDITORIA.md](AUDITORIA.md) #5 |
| A7 | 3 identidades del SO para **una sola persona** (mismo titular) | A · Cuentas | 🟡 | B | Consolidar en una cuenta nominal; eliminar duplicados (se solapa con A3) |
| A8 | `root` con contraseña **activa** (aunque sin login interactivo) | A · Cuentas | 🟡 | B | ✅ **RESUELTO 2026-06-09**: `passwd -l root` (contraseña bloqueada); el backup por llave + comando forzado sigue intacto |
| A9 | Contraseñas **sin caducidad** (`maxdays 99999`), sin política de rotación | A · Cuentas | 🟡 | B | Definir política mínima (`chage -M`); menor prioridad si se pasa a SSH key-only (A1) |

## Detalle por área

### A. Cuentas del SO
- ✅ Sólo **un** UID 0 (`root`); ninguna cuenta de sistema tiene shell de login; 34 cuentas de servicio en `nologin`.
- ✅ Permisos de todos los `~/.ssh` = `700` y `authorized_keys` = `600` (correctos).
- 🟠 `diegoadmin1` (último acceso **22-ago-2025**) y `diegoadmin2` (**23-oct-2025**) llevan ~7–10 meses sin uso y conservan sudo + SSH (A3).
- 🟡 3 cuentas = 1 persona (A7); contraseña de `root` activa (A8); sin caducidad de contraseñas (A9).

### B. sudo / sudoers
- Reglas: `%sudo ALL=(ALL:ALL) ALL` (estándar) + drop-in **`/etc/sudoers.d/rtbadmin-nopasswd`** → `rtbadmin ALL=(ALL) NOPASSWD: ALL`.
- `sudo -l` confirma: `rtbadmin` → `(ALL) NOPASSWD: ALL`; `diegoadmin1/2` → `(ALL : ALL) ALL` (con contraseña).
- ✅ `Defaults use_pty`, `env_reset`, `secure_path`, `mail_badpass` activos (endurecimiento por defecto correcto).
- 🟠 El `NOPASSWD: ALL` de `rtbadmin`, sumado a su pertenencia a `docker`, elimina toda barrera entre una sesión comprometida y root (A2).

### C. SSH
- Config **efectiva** (`sshd -T`): `port 22`, `permitrootlogin forced-commands-only`, `pubkeyauthentication yes`,
  `passwordauthentication yes`, `kbdinteractiveauthentication no`, `permitemptypasswords no`, `maxauthtries 6`, sin `allowusers`.
- ⚠️ **Conflicto de drop-ins** (orden de lectura = primer valor gana):
  `sshd_config` principal dice `PasswordAuthentication no`, pero el `Include` se procesa antes y
  `50-cloud-init.conf` fija `yes` → **gana `yes`**. `60-cloudimg-settings.conf` (`no`) llega tarde y se ignora (A1).
- ✅ `10-rtb-backup.conf`: `PermitRootLogin forced-commands-only` (para el pull de backup de la Pi).
- Llaves autorizadas (1 por cuenta): `root` → ed25519 **restringida** `from="201.141.104.186",command="/usr/bin/rrsync -ro /opt",restrict`
  (excelente, mínimo privilegio: solo lectura de `/opt`, sin shell); `rtbadmin` → RSA-4096 `dhgui@XREX_LAP`;
  `diegoadmin1` → ed25519 `diegoh@kali`; `diegoadmin2` → ed25519 `dhgui@Diego_Lap_T`.
- ✅ Llave privada de `rtbadmin` (`~/.ssh/id_ed25519`, la de GitHub) está **con passphrase** — corrige lo asumido en `MEJORAS.md §S4`.
- 🟡 Sin `AllowUsers`/`AllowGroups`: la restricción de quién entra depende solo de poseer llave (A4).

### D. Login y fail2ban
- Logins exitosos: **solo `rtbadmin`** en 2026, desde IPs residenciales MX (Telmex). `root` nunca entró interactivo.
- Fuerza bruta: **24 474** intentos fallidos históricos; usuarios más probados: `root` (9 598), `admin`, `refacrtb`, `ubuntu`, `user`…
  (`refacrtb` indica que adivinan usuario a partir del dominio — refuerza el valor de A1/A4).
- ✅ fail2ban con jails `sshd`/`postfix`/`dovecot`: jail sshd con **8 IPs baneadas ahora**, 87 baneos totales, 581 fallos filtrados.
- Sesión activa al auditar: 1 (`rtbadmin`, pts/0). Uptime 322 días (reinicio pendiente, ver [AUDITORIA.md](AUDITORIA.md) #8).

### E. Vectores adicionales (docker, cron, timers)
- **docker.sock** montado solo en `portainer` (1 de 8 contenedores) → es el vector de escalada a root del host; agravado por estar en 9443 al mundo (A5/A6).
- Contenedores: 7/8 corren como root (default), `collabora` como UID 1001 (✅ no-root). Ninguno otro monta el socket.
- Cron: solo `root` (renovación de certs semanal) + jobs estándar del sistema; `rtbadmin`/`diegoadmin1/2` **sin crontab**. ✅ Nada sospechoso.
- Timers systemd: todos estándar + `rtb-backup.timer` (pull de la Pi). ✅
- `loginctl`: `Linger=yes` solo en `rtbadmin` — **decisión consciente** para el `ssh-agent` persistente (ver `OPERACIONES.md`), no es un hallazgo.

## Correcciones a la documentación existente (verificado en vivo)
- **`MEJORAS.md §S4`** afirma que `~/.ssh/id_ed25519` está *sin passphrase*: **ya no** — la clave está protegida con passphrase.
- **`MEJORAS.md §S4`** propone `AllowUsers rtbadmin`: confirmado que **no está configurado** hoy (sigue siendo una mejora válida → A4).
- **`INVENTARIO.md §6`** dice `PasswordAuthentication yes` ⚠️: correcto en efecto, pero el **motivo** es el conflicto de drop-ins de cloud-init, no una decisión explícita (matizar → A1).
- **`INVENTARIO.md §6`** reporta fail2ban "16 baneadas, 94 intentos": cifras vivas actualizadas a **8 baneadas / 87 totales / 581 fallos filtrados** (sshd).
- Confirmado: drop-in `/etc/sudoers.d/rtbadmin-nopasswd` es la fuente del `NOPASSWD: ALL` (coincide con la memoria del proyecto).

## §7 — Identidades de aplicación (resumen + enlaces, fuera de alcance profundo)

Sólo inventario; los detalles y riesgos viven en los documentos enlazados.

| Plano | Identidad(es) | Dónde se documenta |
|---|---|---|
| Nextcloud | `admin` (🔴 `<redactado>`) + usuarios nominales (`Gerente_Finanzas`, `Gerente_G`, `Auxiliar_Administrativa`) | [AUDITORIA.md](AUDITORIA.md) #3, `ARQUITECTURA.md` |
| Correo | 12 buzones (gestionados por docker-mailserver, no son cuentas del SO) | `INVENTARIO.md`, `contexto/README.md` |
| Postgres | `admin` / `<redactado>` (🔴 en claro en compose) | [AUDITORIA.md](AUDITORIA.md) #2 |
| Panel buzones | 1 admin único, hash **bcrypt** en `.env`, sesión cookie httpOnly + rate-limit 5/15min | `OPERACIONES.md` |

> Estas credenciales **no** dan acceso al sistema operativo, pero varias están débiles o en claro; su
> remediación se rastrea en los hallazgos #2 y #3 de [AUDITORIA.md](AUDITORIA.md), no se duplica aquí.

## Lo que está bien (no romper)
Root SSH interactivo deshabilitado · llave de backup con `from=`+`command=rrsync -ro`+`restrict` (mínimo privilegio ejemplar) ·
permisos `.ssh` correctos · llave privada de `rtbadmin` con passphrase · fail2ban activo · UFW deny-by-default ·
`kbdinteractive`/`permitemptypasswords` = no · un solo UID 0 · `docker.sock` montado solo en Portainer · sin cron de usuario sospechoso.

---

## Adenda — 23-sep-2026 (fuera del alcance de la auditoría original del 9-jun)

Esta sección **no** es parte de la auditoría de solo-lectura del 9-jun-2026; registra un cambio
real posterior. Detalle completo en RTB-TIN-16 (bóveda Nextcloud Sistemas) y CTRL-SEC-02.

- **`rtbadmin` pasa de 1 a 2 llaves SSH autorizadas.** Se agregó `refacrtb_rtbadmin` (ed25519)
  para trabajo de automatización/soporte, adicional a la RSA-4096 original.
- ⚠️ **Nueva debilidad introducida:** a diferencia de la llave original (con passphrase, ver
  "Lo que está bien" arriba), la llave nueva **no tiene passphrase** — quedó así deliberadamente
  para no depender de un agente SSH en cada conexión, pero reduce la protección si el archivo de
  la llave privada se filtra. Mismo riesgo de fondo que A2: `rtbadmin` sigue siendo
  `sudo NOPASSWD: ALL` + grupo `docker` (root efectivo), así que cualquiera de las dos llaves ya
  equivale a comprometer el host entero. Considerar como extensión de A2 al priorizar remediación.

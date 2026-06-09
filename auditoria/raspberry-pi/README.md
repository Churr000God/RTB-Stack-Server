# Backup externo en Raspberry Pi (modelo pull)

> Destino externo para el backup del VPS RTB. Bloque 0.3.
> Pi: LAN `192.168.10.21`, SSD extra **1 TB**. VPS: público `217.154.101.174`.

## Por qué "pull" (la Pi jala)
La Pi está detrás de NAT (IP privada `192.168.10.21`): el VPS **no puede** conectarse a ella.
La Pi **sí** puede salir a internet y conectarse al VPS público. Por eso la Pi inicia la conexión
y **jala** los datos. Ventajas: no hay que abrir puertos en el router; y si comprometen el VPS,
no puede borrar ni cifrar las copias de la Pi (resistencia a ransomware).

## Arquitectura
```
Raspberry Pi (LAN, SSD 1TB)  ──SSH(out)──▶  VPS 217.154.101.174
   rtb-pull-backup.sh                          authorized_keys (root):
   rsync -ro  ◀── jala /opt ───────────────    command="rrsync -ro /opt",restrict
   → /mnt/ssd/rtb/current + snapshots/         (solo lectura, solo /opt, sin shell)
```
La Pi jala: `nextcloud/data` (139 GB) + `/opt/backups/{postgres,configs,mail,system}`.
Todo el set de backup queda fuera del VPS.

## Paso 1 — En la Pi: generar la llave y datos (UNA VEZ)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_rtb_backup -N "" -C "rtb-pull-backup"
cat ~/.ssh/id_rtb_backup.pub      # ← entregar al admin del VPS
curl -s ifconfig.me; echo         # ← IP pública de salida (para restringir from=)
```

## Paso 2 — En el VPS  ✅ HECHO (2026-06-09)
Configurado en el VPS:
- `/root/.ssh/authorized_keys`:
  ```
  from="201.141.104.186",command="/usr/bin/rrsync -ro /opt",restrict ssh-ed25519 AAAAC3...TlFme rtb-pull-backup
  ```
- `/etc/ssh/sshd_config.d/10-rtb-backup.conf`: `PermitRootLogin forced-commands-only`
- `restrict` desactiva port-forwarding, agente, pty, X11. `rrsync -ro /opt` = solo rsync de lectura bajo `/opt`.
- Para revertir: borrar esa línea de authorized_keys y el drop-in, `systemctl reload ssh`.

### Valores concretos de esta instalación
- Usuario en la Pi: **dhguilleng** → llave en `/home/dhguilleng/.ssh/id_rtb_backup`
- SSD 1 TB: **ext4**, montado en **`/mnt/ssd`** (fstab por UUID, `nofail`)
- IP pública oficina (en `from=`): **201.141.104.186**

## Paso 3 — En la Pi: instalar el script y automatizar
```bash
# Montar el SSD de 1 TB en /mnt/ssd (ej. ext4) y crear el árbol
sudo mkdir -p /mnt/ssd/rtb
sudo cp rtb-pull-backup.sh /usr/local/bin/ && sudo chmod 700 /usr/local/bin/rtb-pull-backup.sh
# Ajustar variables al inicio del script si hace falta (SSH_KEY, DEST)

# Prueba (primera vez baja 139 GB → tarda según tu enlace; luego es incremental)
sudo /usr/local/bin/rtb-pull-backup.sh

# Automatizar: cron diario a las 05:00 (después del backup del VPS de las 03:30 UTC)
echo '0 5 * * * root /usr/local/bin/rtb-pull-backup.sh' | sudo tee /etc/cron.d/rtb-pull-backup
```

## Layout en el SSD
```
/mnt/ssd/rtb/
  current/                    # mirror vivo (espejo del VPS, rsync --delete)
    proyectos/rtb/nextcloud/data/
    backups/{postgres,configs,mail,system}/
  snapshots/YYYYMMDD-HHMM/    # snapshots diarios por hardlink (baratos), retención 14
  logs/
```
1 TB alcanza de sobra: 139 GB de datos + snapshots por hardlink (solo ocupan los deltas).

## Restauración (ejemplo: recuperar Nextcloud al VPS)
```bash
# Desde la Pi, empujar de vuelta (requiere clave de escritura aparte; el pull es solo-lectura)
# o copiar a un USB y subir. Para DB/configs/correo: usar los .zst del mirror con los
# runbooks de auditoria/BACKUPS.md.
```

## Verificación periódica
- En la Pi: revisar `/mnt/ssd/rtb/logs/pull-*.log` y `du -sh /mnt/ssd/rtb/current`.
- Probar restaurar un dump PG desde el mirror cada cierto tiempo (Bloque 0.4).

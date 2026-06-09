# Backups RTB — diseño, operación y restauración

> Implementado 2026-06-09 (Bloque 0.2). Estado: **local automatizado funcionando**.
> Pendiente: destino externo Nextcloud (Raspberry Pi) → Bloque 0.3.

## Qué se respalda

| # | Componente | Origen | Método | Salida | Retención |
|---|---|---|---|---|---|
| 1 | **Postgres** (todas las DBs + roles) | contenedor `postgres` | `pg_dumpall -U admin` \| zstd | `/opt/backups/postgres/all-*.sql.zst` (~18 MB) | 14 |
| 2 | **Configs + secretos + certs** | compose, `web/nginx`, `mailserver/config` (incl. `sasl_passwd`), backend `.env`, `nextcloud .../config.php`, `/etc/letsencrypt`, `sshd_config`, `fail2ban`, `ufw`, cron | tar \| zstd | `/opt/backups/configs/configs-*.tar.zst` (~1.3 MB) | 14 |
| 3 | **Manifiesto del sistema** | docker ps/images/vol/net, paquetes, ufw, red, pm2 | texto | `/opt/backups/system/manifest-*.txt` | 14 |
| 4 | **Correo** | `mailserver/mail-data` + `mail-state` (9.2 GB) | tar \| zstd | `/opt/backups/mail/mail-*.tar.zst` (~4.8 GB) | 4 |
| 5 | **Nextcloud data** (139 GB) | `nextcloud/data` | rsync → externo | Raspberry Pi (pendiente) | — |

- Todos los artefactos: `chmod 600`, dir `/opt/backups` `700 root:root` (contienen secretos y llaves privadas).
- **Solo lectura** sobre datos vivos; no detiene ni reinicia contenedores. `pg_dumpall` es consistente (MVCC); el tar de correo es best-effort con el contenedor corriendo (aceptable).

## Automatización

- Script: `/opt/backups/scripts/rtb-backup.sh` (`700 root:root`).
- systemd: `rtb-backup.timer` → `rtb-backup.service` (oneshot, `Nice=10`, I/O idle).
- **Diario 03:30 UTC** (`RandomizedDelaySec=300`, `Persistent=true` recupera ejecuciones perdidas).
- Logs por corrida en `/opt/backups/logs/backup-*.log`.

```bash
systemctl list-timers rtb-backup.timer      # próxima corrida
sudo systemctl start rtb-backup.service     # ejecutar ya
journalctl -u rtb-backup.service -n 50      # ver última ejecución
sudo /opt/backups/scripts/rtb-backup.sh --no-mail   # prueba rápida (sin correo)
```

## Guardas de seguridad

- Aborta el tramo de **correo** si hay < 25 GB libres en `/` (evita llenar el disco → caída total).
- Retención automática (`prune`) por componente; no crece indefinidamente.
- Cada componente falla de forma aislada (un error no aborta el resto); el log marca `RESULTADO: OK / con errores`.

## ⚠️ Limitación actual

Todo vive en el **mismo disco** `/dev/vda1`. Protege contra borrado accidental / corrupción de datos / mala migración, **NO contra fallo del disco del VPS**. Por eso Nextcloud (lo más grande y valioso) debe ir a destino externo (Pi).

## Restauración (runbooks)

### Postgres
```bash
# Validar
sudo zstd -t /opt/backups/postgres/all-FECHA.sql.zst
# Restaurar (⚠ sobrescribe; idealmente probar antes en contenedor desechable)
sudo zstd -dc /opt/backups/postgres/all-FECHA.sql.zst | docker exec -i postgres psql -U admin -d postgres
```

### Configs / certs
```bash
sudo zstd -dc /opt/backups/configs/configs-FECHA.tar.zst | sudo tar -tvf -      # listar
sudo zstd -dc /opt/backups/configs/configs-FECHA.tar.zst | sudo tar -C / -xf - etc/letsencrypt   # extraer selectivo
```

### Correo
```bash
sudo zstd -dc /opt/backups/mail/mail-FECHA.tar.zst | sudo tar -C /tmp/restore-mail -xf -   # a dir temporal y revisar
# Restauración real: con mailserver detenido, reemplazar mail-data/mail-state (⚠ confirmar)
```

## Pendiente — Bloque 0.3: destino externo Nextcloud (Raspberry Pi / IP fija)

El script ya soporta rsync externo; solo falta configurarlo. Pasos cuando esté la Pi:

1. En la Pi: disco ≥ 256 GB (ideal 500 GB+), usuario `backup`, dir `/mnt/backups/rtb/nextcloud/`.
2. Modelo recomendado **pull** (la Pi jala del VPS) para resistencia a ransomware. Alternativa **push** (más simple).
3. Llave SSH dedicada (sin passphrase para automatizar, restringida por `command=` / `from=`).
4. Crear `/opt/backups/scripts/backup.env` (root, 600):
   ```
   NEXTCLOUD_REMOTE="backup@<IP_FIJA_PI>:/mnt/backups/rtb/nextcloud/"
   NEXTCLOUD_SSH_KEY="/root/.ssh/id_rtb_backup"
   ```
5. Primer `rsync` completo (139 GB, lento según subida); luego incrementales. Considerar snapshots por hardlink (`--link-dest`) en la Pi para retención.
6. Probar restauración parcial desde la Pi.

## Bitácora
- **2026-06-09** — Backup local (DB+configs+correo) implementado, probado y automatizado (timer diario). Restauración del dump PG validada por integridad y contenido. Nextcloud externo pendiente de Raspberry Pi.

# 🟡 Sesión abierta — Backup externo Nextcloud en Raspberry Pi (PAUSADO)

> Última actualización: 2026-06-09. Pausado a petición del usuario.
> Contexto completo en [BACKUPS.md](BACKUPS.md) y [raspberry-pi/README.md](raspberry-pi/README.md).

## Dónde quedamos

El backup **local del VPS está terminado y operativo** (timer diario). Lo que quedó **a medias** es la
copia **externa** de los 139 GB de Nextcloud hacia la Raspberry Pi.

### ✅ Hecho y funcionando
- **VPS — acceso para la Pi configurado:**
  - `/root/.ssh/authorized_keys`: llave de la Pi con comando forzado `from="201.141.104.186",command="/usr/bin/rrsync -ro /opt",restrict ...` (solo lectura de `/opt`, sin shell).
  - `/etc/ssh/sshd_config.d/10-rtb-backup.conf`: `PermitRootLogin forced-commands-only`.
- **Pi — preparada:**
  - Llave generada: `/home/dhguilleng/.ssh/id_rtb_backup` (pública autorizada en el VPS).
  - SSD 1 TB reformateado a **ext4**, montado por UUID en **`/mnt/ssd`** (fstab, `nofail`).
    UUID = `1626dd80-9792-41ba-9cd7-e08ec4dcd7d4`.
  - Script de pull listo en el VPS: `auditoria/raspberry-pi/rtb-pull-backup.sh` (instalar en la Pi en `/usr/local/bin/`).
  - **Test de conexión OK** (jaló `backups/configs` sin problema).

### ❌ Bloqueador — por qué se pausó
La **primera sincronización completa falló por hardware/alimentación del SSD**, NO por el script ni la red:
- El SSD (Micron 3400 NVMe en carcasa **Ugreen RTL9210**, `0bda:9210`) se **desconectó del USB** a ~2.4 GB.
- Cascada en `dmesg`: `USB disconnect` → `Buffer I/O error` → `Aborting journal` →
  `EXT4-fs (sda1): Remounting filesystem read-only`. El dispositivo reapareció como `/dev/sdb`.
- Síntomas (`error -71`, `attempt power cycle`, `unable to enumerate`) = **falta de potencia / cable USB**.

## Para RETOMAR (en orden)

1. **Reiniciar la Pi** para soltar el montaje fantasma:
   ```bash
   sudo reboot
   ```
2. **Reparar el filesystem** (con el disco desmontado):
   ```bash
   sudo umount /mnt/ssd 2>/dev/null
   sudo fsck -y /dev/disk/by-uuid/1626dd80-9792-41ba-9cd7-e08ec4dcd7d4
   sudo mount /mnt/ssd && df -h /mnt/ssd
   ```
3. **Arreglar la causa raíz ANTES de reintentar** (si no, se vuelve a caer):
   - Parche UAS para el RTL9210:
     ```bash
     sudo sed -i 's/$/ usb-storage.quirks=0bda:9210:u/' /boot/firmware/cmdline.txt
     cat /boot/firmware/cmdline.txt   # TODO en una sola línea
     sudo reboot
     ```
   - Energía: fuente oficial potente del Pi + cable corto bueno en puerto USB 3.0, **o** hub USB con alimentación propia.
   - **Dato pendiente de confirmar con el usuario:** modelo/vatios de la fuente del Pi y si el SSD va directo o por hub.
4. **Reintentar** (rsync reanuda desde donde quedó, incremental + `--partial`):
   ```bash
   sudo apt install -y tmux && tmux new -s backup
   sudo cp <repo>/auditoria/raspberry-pi/rtb-pull-backup.sh /usr/local/bin/ && sudo chmod 700 /usr/local/bin/rtb-pull-backup.sh
   sudo /usr/local/bin/rtb-pull-backup.sh
   ```
5. Cuando termine con `RESULTADO: ✅ OK`, **automatizar** en la Pi:
   ```bash
   echo '0 5 * * * root /usr/local/bin/rtb-pull-backup.sh' | sudo tee /etc/cron.d/rtb-pull-backup
   ```

## Hallazgo menor detectado de paso
- `nextcloud/data/data/nextcloud.log` ≈ **554 MB+** (log sin rotar). Limpieza pendiente (no urgente):
  configurar `log_rotate_size` en Nextcloud o truncar. Añadido al tablero como **B6.2**.

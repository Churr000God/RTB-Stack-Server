#!/usr/bin/env bash
#
# rtb-pull-backup.sh — CORRE EN LA RASPBERRY PI (no en el VPS)
# Jala (pull) por SSH+rsync el backup completo del VPS RTB hacia el SSD de 1 TB.
# Modelo pull: la Pi (LAN, detrás de NAT) sale hacia el VPS público. Solo-lectura
# en el VPS (comando forzado rrsync). Snapshots por hardlink (--link-dest).
#
# Instalar en la Pi:  sudo cp rtb-pull-backup.sh /usr/local/bin/ && sudo chmod 700 /usr/local/bin/rtb-pull-backup.sh
# Probar:             sudo /usr/local/bin/rtb-pull-backup.sh
#
set -uo pipefail

# ───────── Configuración (ajusta a tu Pi) ─────────
VPS_HOST="217.154.101.174"        # IP pública del VPS
VPS_USER="root"                   # acceso restringido por comando forzado (solo rrsync -ro /opt)
SSH_KEY="/home/dhguilleng/.ssh/id_rtb_backup"   # llave generada en la Pi
DEST="/mnt/ssd/rtb"               # raíz del SSD de 1 TB — AJUSTA al punto de montaje real del SSD
KEEP_SNAPSHOTS=14                 # snapshots diarios a conservar (hardlinks ⇒ baratos)

# Rutas a jalar (relativas a /opt, que es la raíz del rrsync -ro en el VPS)
PATHS=(
  "proyectos/rtb/nextcloud/data/"          # 139 GB — datos de usuario Nextcloud
  "backups/postgres/"                       # dumps Postgres
  "backups/configs/"                        # configs + secretos + certs
  "backups/mail/"                           # correo
  "backups/system/"                         # manifiestos
)

TS="$(date +%Y%m%d-%H%M%S)"
LOGDIR="${DEST}/logs"; mkdir -p "$LOGDIR"
LOG="${LOGDIR}/pull-${TS}.log"
exec > >(tee -a "$LOG") 2>&1
RC=0
log(){ echo "[$(date +%H:%M:%S)] $*"; }

SSH="ssh -i ${SSH_KEY} -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ConnectTimeout=20"
CURRENT="${DEST}/current"          # mirror vivo (rsync incremental)
SNAPDIR="${DEST}/snapshots/${TS}"  # snapshot del día (hardlinks a current)

log "════════ RTB pull backup ${TS} desde ${VPS_HOST} ════════"
df -h "$DEST" | tail -1
mkdir -p "$CURRENT"

# Snapshot por hardlink del estado previo (antes de actualizar el mirror)
LINK_DEST=()
if [[ -d "$CURRENT" ]] && [[ -n "$(ls -A "$CURRENT" 2>/dev/null)" ]]; then
  cp -al "$CURRENT" "$SNAPDIR" 2>/dev/null && log "snapshot previo → ${SNAPDIR}" || log "aviso: no se pudo crear snapshot hardlink"
fi

# Pull de cada ruta al mirror 'current'
for p in "${PATHS[@]}"; do
  log "→ rsync ${p}"
  mkdir -p "${CURRENT}/${p}"
  if rsync -aH --delete --numeric-ids --partial --info=stats1 \
       -e "$SSH" "${VPS_USER}@${VPS_HOST}:${p}" "${CURRENT}/${p}"; then
    log "  ✓ ${p}"
  else
    log "  ✗ ERROR en ${p}"; RC=1
  fi
done

# Retención de snapshots
mapfile -t snaps < <(ls -1dt "${DEST}/snapshots/"*/ 2>/dev/null)
if (( ${#snaps[@]} > KEEP_SNAPSHOTS )); then
  for s in "${snaps[@]:KEEP_SNAPSHOTS}"; do rm -rf -- "$s" && log "prune snapshot $(basename "$s")"; done
fi

log "──────── Resumen ${TS} ────────"
du -sh "$CURRENT" 2>/dev/null | sed 's/^/  mirror: /'
df -h "$DEST" | tail -1
if (( RC == 0 )); then log "RESULTADO: ✅ OK"; else log "RESULTADO: ⚠️ con errores"; fi
exit $RC

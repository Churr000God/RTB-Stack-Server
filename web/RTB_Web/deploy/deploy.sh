#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
DEPLOY_DIR="$REPO_DIR/deploy"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

echo "[deploy] Verificando dependencias..."
command -v docker >/dev/null 2>&1 || { echo "Docker no está instalado"; exit 1; }
command -v docker compose >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1 || { echo "Docker Compose no está instalado"; exit 1; }

echo "[deploy] Comprobando red externa 'rtbnet'..."
if ! docker network inspect rtbnet >/dev/null 2>&1; then
  echo "[deploy] Creando red externa 'rtbnet'"
  docker network create rtbnet
fi

echo "[deploy] Validando certificados..."
CERTS=(
  "www.refacrtb.com.mx/fullchain.pem"
  "www.refacrtb.com.mx/privkey.pem"
  "nube.refacrtb.com.mx/fullchain.pem"
  "nube.refacrtb.com.mx/privkey.pem"
  "office.refacrtb.com.mx/fullchain.pem"
  "office.refacrtb.com.mx/privkey.pem"
)

for c in "${CERTS[@]}"; do
  if [ ! -f "$DEPLOY_DIR/certs/$c" ]; then
    echo "[warn] Falta el certificado: $DEPLOY_DIR/certs/$c"
  fi
done

echo "[deploy] Lanzando Nginx (rtb_web)..."
if command -v docker compose >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" up -d
else
  docker-compose -f "$COMPOSE_FILE" up -d
fi

echo "[deploy] Listo. Puertos expuestos: 80 y 443"
echo "[deploy] Verifica los contenedores con: docker ps --filter name=rtb_web"
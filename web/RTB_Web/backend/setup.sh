#!/bin/bash

echo "🔧 Iniciando configuración del backend RTB..."

# Navegar a la carpeta del backend (por si se ejecuta desde raíz)
cd "$(dirname "$0")" || exit 1

# 1. Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# 2. Crear carpeta para los PDFs generados
UPLOADS_PATH="../public/uploads"
if [ ! -d "$UPLOADS_PATH" ]; then
  echo "📁 Creando carpeta: $UPLOADS_PATH"
  mkdir -p "$UPLOADS_PATH"
else
  echo "📁 Carpeta de uploads ya existe."
fi

# 3. Crear .env si no existe
if [ ! -f ".env" ]; then
  echo "🔐 Creando archivo .env por defecto..."
  cat <<EOF > .env
PORT=3000
NEXTCLOUD_URL=https://tuservidor.nextcloud.com/remote.php/webdav
NEXTCLOUD_USER=usuario
NEXTCLOUD_PASS=contraseña
EOF
  echo "⚠️  Se creó el archivo .env. Edita los valores si es necesario."
else
  echo "🔐 Archivo .env ya existe."
fi

# 4. Confirmación final
echo "✅ Backend configurado correctamente."
echo "👉 Puedes iniciar el servidor con: npm start o nodemon server.js"

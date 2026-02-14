@echo off
setlocal

echo 🔧 Iniciando configuración del backend RTB...

:: Navegar al directorio actual del script
cd /d %~dp0

:: 1. Instalar dependencias
echo 📦 Instalando dependencias...
call npm install

:: 2. Crear carpeta de uploads
set "UPLOADS_DIR=..\public\uploads"
if not exist "%UPLOADS_DIR%" (
    echo 📁 Creando carpeta: %UPLOADS_DIR%
    mkdir "%UPLOADS_DIR%"
) else (
    echo 📁 Carpeta de uploads ya existe.
)

:: 3. Crear archivo .env si no existe
if not exist ".env" (
    echo 🔐 Creando archivo .env por defecto...
    (
        echo PORT=3000
        echo NEXTCLOUD_URL=https://tuservidor.nextcloud.com/remote.php/webdav
        echo NEXTCLOUD_USER=usuario
        echo NEXTCLOUD_PASS=contraseña
    ) > .env
    echo ⚠️  Se creó el archivo .env. Edita los valores si es necesario.
) else (
    echo 🔐 Archivo .env ya existe.
)

:: 4. Confirmación final
echo ✅ Backend configurado correctamente.
echo 👉 Puedes iniciar el servidor con: npm start o nodemon server.js

endlocal

#!/bin/bash

# === CONFIGURACIÓN GENERAL ===
CONFIG_DIR="./config"
DMS_DIR="$(pwd)"
SASL_FILE="sasl_passwd"

# === LISTA DE USUARIOS ===
usuarios=(
  "contacto@refacrtb.com.mx Jul240725contacto"
  "ventas@refacrtb.com.mx Jul240725ventas"
  "finanzas@refacrtb.com.mx Jul240725finanzas"
  "facturacion@refacrtb.com.mx Jul240725facturacion"
  "almacen@refacrtb.com.mx Jul240725almacen"
  "recursos_humanos@refacrtb.com.mx Jul240725recursoshumanos"
  "sistemas@refacrtb.com.mx Jul240725sistemas"
  "asistente@refacrtb.com.mx Jul240725asistente"
  "productos_especiales@refacrtb.com.mx Jul240725productosespeciales"
  "gerente_general@refacrtb.com.mx Jul240725gerenteg"
  "angel_badmon@refacrtb.com.mx Jul240725angel"
  "tbadillob@refacrtb.com.mx Jul240725TBBV"
)

echo "🔐 Paso 1: Creando carpeta $CONFIG_DIR si no existe..."
mkdir -p "$CONFIG_DIR"

# === Verificar si sasl_passwd está definido correctamente ===
if [ -f "$DMS_DIR/$SASL_FILE" ]; then
  echo "📦 Paso 2: Moviendo y protegiendo $SASL_FILE..."
  cp "$DMS_DIR/$SASL_FILE" "$CONFIG_DIR/$SASL_FILE"
  postmap hash:"$CONFIG_DIR/$SASL_FILE"
  chmod 600 "$CONFIG_DIR/$SASL_FILE" "$CONFIG_DIR/$SASL_FILE.db"
  chown root:root "$CONFIG_DIR/$SASL_FILE" "$CONFIG_DIR/$SASL_FILE.db"
else
  echo "⚠️ Advertencia: $SASL_FILE no encontrado. SMTP relay puede fallar si usas autenticación externa (MailerSend/Brevo)."
fi

# === Agregar volúmenes al docker-compose.yml si no existen ===
echo "🛠️ Paso 3: Verificando volumen en docker-compose.yml..."
if grep -q "mailserver:" "$DMS_DIR/docker-compose.yml"; then
  if ! grep -q "sasl_passwd" "$DMS_DIR/docker-compose.yml"; then
    echo "🔧 Agregando volumen de sasl_passwd a docker-compose.yml..."
    sed -i '/volumes:/a \ \ \ \ \ \ - ./config/sasl_passwd:/etc/postfix/sasl_passwd\n\ \ \ \ \ \ - ./config/sasl_passwd.db:/etc/postfix/sasl_passwd.db' "$DMS_DIR/docker-compose.yml"
  else
    echo "✅ Volumen de sasl_passwd ya existe."
  fi
else
  echo "❌ Error: No se detectó el contenedor 'mailserver:' en docker-compose.yml"
  exit 1
fi

# === Reiniciar el contenedor ===
echo "♻️ Paso 4: Reiniciando contenedor mailserver..."
cd "$DMS_DIR"
docker compose down
docker compose up -d --build

# === Esperar arranque completo ===
echo "⏳ Paso 5: Esperando 10 segundos para que el contenedor arranque..."
sleep 10

# === Crear buzones dentro del contenedor ===
echo "📧 Paso 6: Creando buzones de correo dentro del contenedor..."
for usuario in "${usuarios[@]}"; do
  correo=$(echo $usuario | cut -d' ' -f1)
  clave=$(echo $usuario | cut -d' ' -f2)

  docker run --rm \
    -v "$DMS_DIR/config":/tmp/docker-mailserver \
    -v "$DMS_DIR/mail-data":/var/mail \
    mailserver/docker-mailserver setup email add "$correo" "$clave"

  echo "✔️ Buzón añadido: $correo"
done

echo "✅ Configuración finalizada. El servidor de correo está listo con buzones creados y soporte para SMTP relay externo (MailerSend o Brevo)."


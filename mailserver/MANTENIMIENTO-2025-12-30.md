# Mantenimiento Contenedor Correos
**Fecha:** 30 de Diciembre del 2025  
**Responsable:** Diego Hermilo Guillen Garcia

---

## 📋 Resumen de Actividades

### 1. Análisis Completo del Mail Server

**Objetivo:** Revisar el estado general del servidor de correo y detectar problemas de sincronización o conexión.

**Resultados:**
- ✅ Servidor operando correctamente (12 cuentas activas)
- ✅ Dominio: `refacrtb.com.mx`
- ✅ Servicios activos: SMTP (25, 587), IMAPS (993)
- ✅ Protección antivirus, antispam y Fail2ban funcionando
- ✅ Relay SMTP configurado con MailerSend

---

### 2. Revisión de Logs

**Análisis realizado:**
- Logs de sincronización (últimas 48 horas)
- Logs de errores y advertencias
- Actividad de usuarios legítimos

**Hallazgos:**
- ✅ Sin errores de autenticación de usuarios legítimos
- ✅ Entrega de correos funcionando correctamente
- ✅ Verificación DKIM/DMARC/SPF exitosa
- ⚠️ Múltiples intentos de conexión de scanners/bots (bloqueados correctamente)

**Usuarios más activos:**
- `facturacion@refacrtb.com.mx`
- `finanzas@refacrtb.com.mx`
- `almacen@refacrtb.com.mx`

---

### 3. Auditoría de Fail2ban

**Estado inicial:**

| Jail | IPs Bloqueadas | Total Baneos Históricos |
|------|----------------|-------------------------|
| postfix | 7 IPs | 247 |
| dovecot | 1 IP | 122 |
| postfix-sasl | 0 IPs | 120 |

**IPs bloqueadas identificadas:**
```
Postfix:
- 165.154.174.206
- 46.101.122.95
- 152.32.243.98
- 3.134.148.59 (AWS Ohio)
- 3.137.73.221 (AWS Ohio)
- 165.154.54.189
- 23.92.30.251

Dovecot:
- 201.141.108.178 (México)
```

**Configuración inicial:**
- Bantime: 1 semana
- Maxretry: 6 intentos
- Whitelist: Solo localhost (127.0.0.1/8)

---

### 4. Actualización de Whitelist Fail2ban

**Problema identificado:**  
No había IPs de redes privadas en whitelist, lo que podría causar bloqueos accidentales de clientes legítimos.

**Acción realizada:**

Actualización del archivo `/etc/fail2ban/jail.local` dentro del contenedor:

**Whitelist anterior:**
```ini
ignoreip = 127.0.0.1/8
```

**Whitelist actualizada:**
```ini
ignoreip = 127.0.0.1/8 ::1 192.168.0.0/24 10.0.0.0/8 172.16.0.0/12
```

**Redes incluidas:**
- `127.0.0.1/8` - Localhost IPv4
- `::1` - Localhost IPv6
- `192.168.0.0/24` - Red LAN local
- `10.0.0.0/8` - Redes privadas clase A
- `172.16.0.0/12` - Redes privadas clase B (Docker)

**Aplicado a todos los jails:**
- dovecot ✅
- postfix ✅
- postfix-sasl ✅
- custom ✅

---

### 5. Limpieza de Baneos

**Acción:** Liberación de todas las IPs bloqueadas previamente

```bash
sudo docker exec mailserver fail2ban-client unban --all
```

**Resultado:** 8 IPs desbaneadas

---

### 6. Verificación Post-Configuración

**Comandos ejecutados:**
```bash
sudo docker exec mailserver fail2ban-client reload
sudo docker exec mailserver fail2ban-client get dovecot ignoreip
sudo docker exec mailserver fail2ban-client get postfix ignoreip
```

**Estado final:**

| Jail | IPs Bloqueadas | Estado |
|------|----------------|--------|
| postfix | 0 | ✅ Limpio |
| dovecot | 0 | ✅ Limpio |
| postfix-sasl | 0 | ✅ Limpio |
| custom | 0 | ✅ Limpio |

---

### 7. Reinicio del Contenedor

**Acción:** Reinicio completo para verificar persistencia de configuración

```bash
sudo docker restart mailserver
```

**Resultado:** ✅ Contenedor reiniciado exitosamente

---

## 📊 Configuración Final

### Archivos Modificados
- `/etc/fail2ban/jail.local` (dentro del contenedor)

### Configuración Persistente
Los cambios se mantienen después de reiniciar el contenedor ya que el archivo está en la configuración base de docker-mailserver.

---

## ✅ Resultados

1. ✅ Mail server operando correctamente sin errores críticos
2. ✅ Whitelist de Fail2ban actualizada para incluir redes privadas
3. ✅ 8 IPs previamente bloqueadas liberadas
4. ✅ Configuración verificada y persistente tras reinicio
5. ✅ Sin bloqueos de usuarios legítimos

---

## 📝 Recomendaciones

1. **Monitoreo continuo:** Revisar logs semanalmente para detectar patrones anómalos
2. **Validación de clientes:** Probar conexiones desde equipos de la red local para confirmar que no sean bloqueados
3. **Revisión de IPs bloqueadas:** Ejecutar mensualmente:
   ```bash
   sudo docker exec mailserver fail2ban-client status postfix
   sudo docker exec mailserver fail2ban-client status dovecot
   ```
4. **Backup de configuración:** Respaldar `/opt/proyectos/rtb/mailserver/config/` regularmente

---

## 🔧 Comandos Útiles para Futuro

### Verificar estado de Fail2ban
```bash
sudo docker exec mailserver fail2ban-client status
```

### Ver IPs bloqueadas en un jail específico
```bash
sudo docker exec mailserver fail2ban-client status postfix
```

### Desbanear una IP específica
```bash
sudo docker exec mailserver fail2ban-client set postfix unbanip <IP>
```

### Ver whitelist actual
```bash
sudo docker exec mailserver fail2ban-client get dovecot ignoreip
```

### Ver logs en tiempo real
```bash
sudo docker logs -f mailserver
```

---

**Documento generado:** 30/12/2025 18:40 UTC  
**Duración del mantenimiento:** ~30 minutos  
**Sistema:** Ubuntu Linux - Docker Mailserver (docker-mailserver/docker-mailserver:latest)

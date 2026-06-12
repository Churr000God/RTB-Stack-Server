# DNS — Acciones pendientes B6.1
> Generado 2026-06-11 · Zona DNS: panel **IONOS** (evidencia: rDNS `pbiaas.com`, RUA actual en `onsecureserver.net`)
> Todos los cambios los aplica el **operador** en el panel DNS de IONOS.

---

## 1. DMARC — cambiar `rua` a buzón propio

### Registro a modificar
| Campo | Valor |
|-------|-------|
| Tipo  | TXT   |
| Nombre | `_dmarc.refacrtb.com.mx` |

**Valor actual:**
```
v=DMARC1; p=reject; rua=mailto:dmarc_rua@onsecureserver.net
```
`rua=` apunta a un buzón genérico de IONOS, no del dominio propio. Los reportes de agregación
van a un tercero y no son accesibles.

**Valor nuevo (reemplazar el TXT completo):**
```
v=DMARC1; p=reject; rua=mailto:admin@refacrtb.com.mx; ruf=mailto:admin@refacrtb.com.mx; fo=1
```

> **Buzón `rua`:** se usa `admin@refacrtb.com.mx` (ya existe, es el `POSTMASTER_ADDRESS`
> configurado en `mailserver/mailserver.env`). Si se prefiere separar los reportes, crear
> primero `dmarc@refacrtb.com.mx` y usar ese.
>
> **`fo=1`**: genera reportes de fallo forense cuando algún mecanismo SPF/DKIM falla
> (más detallado que el default `fo=0`).

### Verificación (tras aplicar)
```bash
dig +short TXT _dmarc.refacrtb.com.mx
# Esperado: "v=DMARC1; p=reject; rua=mailto:admin@refacrtb.com.mx ..."
```

---

## 2. DKIM de MailerSend — CNAMEs a añadir

La firma DKIM del correo saliente la realiza **MailerSend** (relay; puerto 25 IONOS bloqueado).
La clave local `mailserver/config/opendkim/keys/refacrtb.com.mx/mail.txt` (selector `mail`)
está **huérfana y no publicada** — no confundir con los selectores de MailerSend.

### Cómo obtener los CNAMEs
1. Acceder al panel de **MailerSend** → **Domains** → `refacrtb.com.mx` → **DNS records**.
2. Copiar los registros CNAME que pide MailerSend para verificación de dominio y firma DKIM.
   Suelen ser 3 registros con forma similar a:

| Tipo  | Nombre (host)                            | Valor (apunta a)              |
|-------|------------------------------------------|-------------------------------|
| CNAME | `<selector1>._domainkey.refacrtb.com.mx` | `<valor proporcionado por MailerSend>` |
| CNAME | `<selector2>._domainkey.refacrtb.com.mx` | `<valor proporcionado por MailerSend>` |
| CNAME | `em<N>.refacrtb.com.mx` *(Return-Path)*  | `<valor proporcionado por MailerSend>` |

> **Importante:** pegar los valores **exactos** del panel de MailerSend; no inventar ni truncar.

### Verificación (tras aplicar)
```bash
# Sustituir <selector> por el nombre real que da MailerSend
dig +short CNAME <selector>._domainkey.refacrtb.com.mx
# Esperado: resuelve a un host de MailerSend (e.g. dkim.mailersend.net)
```
Enviar un correo de prueba a **mail-tester.com** y confirmar `dkim=pass` con el selector de
MailerSend.

---

## 3. Eliminar registros DNS de servicios retirados

Los servicios `api.refacrtb.com.mx` (FastAPI) y `app.refacrtb.com.mx` (OnlyOffice) han sido
**purgados** (B4.1). Sus certificados Let's Encrypt ya fueron eliminados con `certbot delete`.
Queda borrar los registros DNS en IONOS:

| Tipo | Nombre                    | Acción   |
|------|---------------------------|----------|
| A    | `api.refacrtb.com.mx`     | Eliminar |
| A    | `app.refacrtb.com.mx`     | Eliminar |

> Si existen también registros AAAA (IPv6) para estos subdominios, eliminarlos igualmente.

### Verificación (tras aplicar)
```bash
dig +short A api.refacrtb.com.mx   # → vacío (NXDOMAIN)
dig +short A app.refacrtb.com.mx   # → vacío (NXDOMAIN)
```

---

## 4. Notas técnicas

- **SPF actual:** `v=spf1 include:_spf.mailersend.net include:spf.brevo.com ~all`
  El `~all` (softfail) es correcto dado que el envío directo (puerto 25) está bloqueado por IONOS.
  No cambiar por `-all` (hardfail) mientras no se controle todo el egress del dominio.
- **Gestión DNS:** zona `refacrtb.com.mx` en panel IONOS (confirmar al acceder al panel).
- **Verificador del dashboard:** la pestaña DNS del panel admin (`/api/mail/dns`) usa por
  defecto el selector `mail` para DKIM — no coincide con el selector real de MailerSend.
  Tras confirmar el selector real, setear la variable de entorno `DKIM_SELECTOR=<selector>`
  en el proceso PM2 del backend para que el check dé verde.

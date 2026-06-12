# DNS — B6.1 ✅ CERRADO 2026-06-12

> Generado 2026-06-11 · **Cerrado 2026-06-12** · Zona DNS: panel **IONOS**
> Todos los cambios fueron aplicados por el operador en el panel DNS de IONOS y verificados
> contra el nameserver autoritativo (`ns15.domaincontrol.com`).

---

## 1. DMARC ✅

**Valor aplicado:**
```
v=DMARC1; p=reject; rua=mailto:admin@refacrtb.com.mx; ruf=mailto:admin@refacrtb.com.mx; fo=1
```

**Verificación (autoritativo):**
```
$ dig TXT _dmarc.refacrtb.com.mx @ns15.domaincontrol.com +short
"v=DMARC1; p=reject; rua=mailto:admin@refacrtb.com.mx; ruf=mailto:admin@refacrtb.com.mx; fo=1"
```

> `fo=1` genera reportes forenses cuando falla algún mecanismo SPF/DKIM.
> `rua`/`ruf` apuntan a `admin@refacrtb.com.mx` (POSTMASTER_ADDRESS del mailserver).

---

## 2. DKIM de MailerSend ✅

Selector real de MailerSend: **`mlsend2`**

| Tipo  | Nombre                                    | Valor                              |
|-------|-------------------------------------------|------------------------------------|
| CNAME | `mlsend2._domainkey.refacrtb.com.mx`      | `mlsend2._domainkey.mailersend.net` |
| CNAME | `mta.refacrtb.com.mx` *(Return-Path)*     | `mailersend.net`                   |

**Verificación:**
```
$ dig CNAME mlsend2._domainkey.refacrtb.com.mx +short
mlsend2._domainkey.mailersend.net.

$ dig CNAME mta.refacrtb.com.mx +short
mailersend.net.
```

**Backend actualizado:** `DKIM_SELECTOR=mlsend2` en `web/RTB_Web/backend/.env`.
El verificador DNS del panel admin (`/api/mail/dns`) ya usa el selector correcto.

---

## 3. DNS de servicios retirados ✅

| Tipo | Nombre                | Acción   | Estado   |
|------|-----------------------|----------|----------|
| A    | `api.refacrtb.com.mx` | Eliminado | NXDOMAIN |
| A    | `app.refacrtb.com.mx` | Eliminado | NXDOMAIN |

**Verificación (autoritativo):**
```
$ dig A api.refacrtb.com.mx @ns15.domaincontrol.com +short
(vacío)
$ dig A app.refacrtb.com.mx @ns15.domaincontrol.com +short
(vacío)
```

---

## 4. Notas técnicas (estado final)

- **SPF:** `v=spf1 ip4:217.154.101.174 include:spf.brevo.com include:_spf.mailersend.net ~all`
  El `~all` (softfail) es correcto — puerto 25 bloqueado por IONOS, no cambiar a `-all`.
- **DKIM selector local (`mail`)**: la clave en `mailserver/config/opendkim/keys/` está huérfana
  y no publicada en DNS. No confundir con el selector `mlsend2` de MailerSend.
- **Gestión DNS:** zona `refacrtb.com.mx` en panel IONOS (ns15.domaincontrol.com).

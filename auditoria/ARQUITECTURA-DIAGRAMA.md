# Diagrama de arquitectura — RTB

> 2026-06-09 · refleja el estado **real** verificado (no el deseado)

## Petición: subdominio → proxy → contenedor → datos

```mermaid
flowchart TB
    subgraph internet["🌐 Internet"]
        user["Cliente / navegador"]
        sender["Email externo"]
    end

    subgraph ufw["UFW (deny-by-default) — abiertos: 22, 25, 80, 443, 587, 993, 9443"]
        direction TB
        subgraph host["Host Ubuntu 22.04 · 217.154.101.174 · 16GB · 0 swap"]

            node["Backend Node/Express\nPM2 · host :3000\n(solo desde rtbnet vía UFW)"]

            subgraph rtbnet["red rtbnet 172.25.0.0/16 (PLANA)"]
                nginx["rtb_web (nginx)\n:80 :443"]
                nc["nextcloud :80\nv31.0.7 (~4.8GB)"]
                pg[("postgres:15\n:5432")]
                col["collabora :9980"]
                portainer["portainer :9443\n⚠ monta docker.sock"]
                oo["onlyoffice :8080\n💤 zombie (sin proxy)"]
            end

            subgraph mailnet["red mailserver_default 172.18.0.0/16 (aislada)"]
                mail["mailserver\nPostfix/Dovecot\n:25 :587 :993"]
            end

            subgraph dnet["docker_default"]
                api["api_rtb (FastAPI)\n♻ crash-loop"]
            end

            ncdata[("nextcloud/data\n⚠ sin backup")]
            pgdata[("db/data\n⚠ sin backup")]
            maildata[("mail-data/state\n~8GB · backup vacío 2025-07")]
        end
    end

    relay["MailerSend\n(relay salida + DKIM)"]

    user -- "www.refacrtb" --> nginx
    user -- "nube.refacrtb" --> nginx
    user -- "office.refacrtb" --> nginx
    user -. "app./api. (sin ruta)" .-> nginx
    user -- "9443 directo ⚠" --> portainer

    nginx -- "/ (static)" --> nginx
    nginx -- "/api/ → 172.25.0.1:3000" --> node
    nginx -- "nube → :80" --> nc
    nginx -- "office → :9980" --> col
    nc --> pg
    nc --> ncdata
    pg --> pgdata

    sender -- "MX :25" --> mail
    user -- "IMAP/SMTP :993/:587" --> mail
    mail --> maildata
    mail -- "salida" --> relay

    style pg fill:#fdd
    style ncdata fill:#fdd
    style pgdata fill:#fdd
    style portainer fill:#fe9
    style oo fill:#eee
    style api fill:#eee
    style maildata fill:#fe9
```

## Mapa rápido subdominio → destino

| Subdominio | → | Destino real |
|---|---|---|
| www.refacrtb.com.mx | → | nginx (static) + `/api/` → Node :3000 |
| nube.refacrtb.com.mx | → | nginx → nextcloud:80 → postgres |
| office.refacrtb.com.mx | → | nginx → collabora:9980 |
| mail.refacrtb.com.mx | → | mailserver (MX/IMAP/SMTP) → relay MailerSend |
| app.refacrtb.com.mx | ✗ | sin ruta (onlyoffice zombie) |
| api.refacrtb.com.mx | ✗ | sin ruta (api_rtb crash-loop) |

## Segmentación objetivo (propuesta, ver PLAN-REFACTOR §7)

```mermaid
flowchart LR
    nginx["nginx"] --- proxynet["red proxy"]
    proxynet --- nc["nextcloud"]
    proxynet --- col["collabora"]
    nc --- dbnet["red db (interna)"]
    dbnet --- pg[("postgres")]
    portainer["portainer (solo VPN/tunnel)"]
    classDef iso fill:#dfd
    class dbnet iso
```
Hoy `postgres` y `portainer` están en la **misma** red que nginx (cara a internet). Objetivo: `postgres` solo alcanzable por `nextcloud` en una red `db` interna; `portainer` fuera de la red pública.

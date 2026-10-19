# Browsy Sync Server (Self-Hosted)

Minimalistický, vysoce bezpečný synchronizační server pro prohlížeč **Browsy Chromium** (Desktop & Android).

## Funkce
- **Zero-Knowledge šifrování**: Veškerá data (záložky, historie, nastavení, textové zkratky a filtry reklam) jsou před odesláním na server zašifrována přímo v prohlížeči pomocí **AES-256-GCM** a vašeho vlastního hesla (Sync Passphrase). Server ukládá pouze nečitelné šifrované balíčky.
- **Lehké a bez závislostí**: Běží na čistém Node.js bez nutnosti externích databází.
- **Docker Ready**: Spuštění jedním příkazem přes Docker nebo Docker Compose.
- **Kompatibilita**: Funguje bezchybně s Browsy pro Windows, Linux, macOS i Android.

---

## Rychlé spuštění

### 1. Pomocí Node.js
```bash
cd sync-server
export PORT=8080
export SYNC_TOKEN="moje_tajne_heslo_serveru"
node server.js
```

### 2. Pomocí Docker Compose
```bash
cd sync-server
docker compose up -d
```

Server poběží na `http://localhost:8080` (nebo za vaší doménou/reverse proxy jako Nginx, Caddy či Traefik s HTTPS).

---

## Nastavení v aplikaci Browsy
1. Otevřete **Nastavení -> Synchronizace dat**.
2. Zvolte poskytovatele **Self-hosted synchronizační server** (nebo **WebDAV**).
3. Vyplňte adresu serveru (např. `https://sync.vasedomena.cz`) a Váš token.
4. Zadejte **Heslo šifrování (Sync Passphrase)** – toto heslo musí být stejné na PC i mobilu.
5. Klepněte na **Otestovat připojení** a následně **Synchronizovat nyní**.

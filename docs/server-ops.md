# GhostDrop Server Operations

This guide is safe to commit. It contains commands, templates, and checklists only. Do not add real secrets, private keys, access tokens, or VPS-specific credentials to this file.

Production domain:

```txt
ghostdrop.app
```

## What Must Stay Private

Never commit or paste these into issues, logs, docs, or chat:

- `secrets/*.txt`
- `.env.production`
- private SSH keys such as `~/.ssh/id_ed25519`
- DigitalOcean API tokens
- database dumps that may contain transfer metadata
- MinIO object backups containing uploaded files

The public SSH key ending in `.pub` is safe to give to DigitalOcean.

## Fresh VPS Checklist

Use a non-root deploy user for normal work.

```bash
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy
```

Before disabling root SSH login, verify a second terminal can connect successfully:

```bash
ssh deploy@YOUR_VPS_IP
docker ps
docker compose version
```

If Docker group membership is not active yet:

```bash
newgrp docker
```

## SSH Hardening

Recommended SSH posture:

- SSH key login enabled
- password login disabled
- direct root SSH login disabled after deploy user is confirmed working
- private key stored only on your local trusted machine

Keep one existing SSH session open while changing SSH settings so you can recover if a new login fails.

## Firewall

DigitalOcean Cloud Firewall should allow only:

```txt
22/tcp
80/tcp
443/tcp
443/udp optional, for HTTP/3
```

If `ufw` is active on the VPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw reload
sudo ufw status
```

PostgreSQL, Redis, MinIO, and the API should not be exposed directly to the public internet. The production Compose file exposes only Caddy.

## DNS

Create these records for `ghostdrop.app`:

```txt
A     @      YOUR_VPS_IPV4
A     www    YOUR_VPS_IPV4
```

If the VPS has IPv6:

```txt
AAAA  @      YOUR_VPS_IPV6
AAAA  www    YOUR_VPS_IPV6
```

Verify DNS from the VPS:

```bash
getent hosts ghostdrop.app
getent hosts www.ghostdrop.app
```

## Clone And Configure

Log in as the deploy user:

```bash
ssh deploy@YOUR_VPS_IP
```

Clone the repo:

```bash
cd ~
git clone YOUR_REPO_URL ghostdrop
cd ghostdrop
```

Create production env file:

```bash
cp .env.production.example .env.production
nano .env.production
```

Use this shape, but keep the actual `.env.production` file uncommitted:

```env
DOMAIN=ghostdrop.app
ACME_EMAIL=admin@ghostdrop.app
CORS_ORIGINS=https://ghostdrop.app,https://www.ghostdrop.app
MAX_FILE_SIZE_BYTES=1073741824
MAX_DOWNLOADS=10
MAX_EXPIRES_IN_MINUTES=10080
POSTGRES_USER=ghostdrop
POSTGRES_DB=ghostdrop
MINIO_BUCKET=ghostdrop
```

## Create Docker Secret Files

Run from the repo root:

```bash
mkdir -p secrets
chmod 700 secrets
openssl rand -base64 32 > secrets/postgres_password.txt
openssl rand -base64 32 > secrets/redis_password.txt
openssl rand -hex 16 > secrets/minio_root_user.txt
openssl rand -base64 32 > secrets/minio_root_password.txt
chmod 600 secrets/*.txt
```

These files are ignored by git. Docker Compose mounts them into containers under `/run/secrets/...`.

## Validate Config

```bash
docker compose -f compose.prod.yaml --env-file .env.production config --quiet
```

No output means the Compose config is valid.

## Build And Start

```bash
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

Check status:

```bash
docker compose -f compose.prod.yaml --env-file .env.production ps
```

Follow all logs:

```bash
docker compose -f compose.prod.yaml --env-file .env.production logs -f
```

Targeted logs:

```bash
docker compose -f compose.prod.yaml --env-file .env.production logs -f gateway
docker compose -f compose.prod.yaml --env-file .env.production logs -f api
docker compose -f compose.prod.yaml --env-file .env.production logs -f postgres
docker compose -f compose.prod.yaml --env-file .env.production logs -f redis
docker compose -f compose.prod.yaml --env-file .env.production logs -f minio
```

## Health Checks

API health:

```bash
curl https://ghostdrop.app/api/health
```

Expected response:

```json
{"status":"ok","redis":"up","postgres":"up","minIO":"up"}
```

Container status:

```bash
docker compose -f compose.prod.yaml --env-file .env.production ps
```

Disk usage:

```bash
df -h
docker system df
```

Memory usage:

```bash
free -h
docker stats
```

Exit `docker stats` with `Ctrl+C`.

## Browser Smoke Test

Open:

```txt
https://ghostdrop.app
```

Test the user flow:

1. Upload a small file.
2. Copy the transfer code.
3. Open an incognito/private browser window.
4. Enter the code.
5. Download the file.
6. Confirm download count behavior.

## Common Failure: Website Works But API Returns 502

This usually means Caddy is serving the static frontend, but the API container is down or unreachable.

Check:

```bash
docker compose -f compose.prod.yaml --env-file .env.production ps
docker compose -f compose.prod.yaml --env-file .env.production logs --tail=150 api
docker compose -f compose.prod.yaml --env-file .env.production logs --tail=100 gateway
```

If API logs show PostgreSQL authentication failure:

```txt
password authentication failed for user "ghostdrop"
```

The database volume was probably initialized with an old password and the secret file changed later.

If there is no important data yet, reset all Docker volumes:

```bash
docker compose -f compose.prod.yaml --env-file .env.production down -v
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

If data must be preserved, do not run `down -v`. Update the Postgres user password to match the current secret instead.

## Update Deployment

Before major updates, take a backup.

```bash
cd ~/ghostdrop
git pull
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
docker image prune
```

Restart without rebuilding:

```bash
docker compose -f compose.prod.yaml --env-file .env.production restart
```

Stop without deleting data:

```bash
docker compose -f compose.prod.yaml --env-file .env.production down
```

Stop and delete local production data:

```bash
docker compose -f compose.prod.yaml --env-file .env.production down -v
```

Only use `down -v` when you intentionally want to delete Docker volumes.

## Backups

Back up at least:

- PostgreSQL data or `pg_dump` output
- MinIO object data if preserving uploaded files matters
- `.env.production`
- `secrets/`
- Caddy data volume, because it contains certificates and ACME account state

Minimal Postgres dump example:

```bash
mkdir -p ~/backups
docker compose -f compose.prod.yaml --env-file .env.production exec -T postgres \
  pg_dump -U ghostdrop ghostdrop > ~/backups/ghostdrop-postgres-$(date +%F).sql
chmod 600 ~/backups/*.sql
```

Copy backups off the VPS regularly. A backup stored only on the same VPS does not protect against VPS loss.

## Disk Safety

Anonymous file upload services can fill disks quickly.

Check regularly:

```bash
df -h
docker system df
```

If disk usage is high:

```bash
docker image prune
docker builder prune
```

Do not prune volumes unless you are intentionally deleting application data.

## TLS And Caddy

Caddy automatically requests and renews certificates for `ghostdrop.app` when DNS points to the VPS and ports `80` and `443` are reachable.

Check gateway logs:

```bash
docker compose -f compose.prod.yaml --env-file .env.production logs --tail=150 gateway
```

Common TLS problems:

- DNS does not point to the VPS
- port `80/tcp` is blocked
- port `443/tcp` is blocked
- wrong `DOMAIN` in `.env.production`
- too many failed certificate attempts during repeated testing

## Security Checklist

Keep these true over time:

- deploy user uses SSH keys
- root SSH login disabled or tightly restricted
- password SSH login disabled
- `secrets/*.txt` permissions are `600`
- `secrets/` permissions are `700`
- `.env.production` is not committed
- only Caddy ports are public
- Docker and OS security updates are applied
- backups are tested, not just created
- disk usage is monitored
- upload size, expiry, and download count caps remain reasonable

## If The VPS Seems Compromised

Immediate response:

1. Take the site offline if needed.
2. Rotate SSH keys.
3. Rotate DigitalOcean account credentials and API tokens.
4. Rotate app secrets in `secrets/`.
5. Rebuild containers from a clean checkout.
6. Restore from a known-good backup if necessary.
7. Review logs and firewall rules.

If root access or the OS itself is suspected compromised, the safest path is usually to create a fresh VPS, restore clean backups, and repoint DNS.

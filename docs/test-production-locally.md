# Test Production Locally

This flow tests the production Docker setup from a fresh clone without installing `pnpm` on the host. The Docker builds install `pnpm` inside the build containers.

## Requirements

- Docker Engine
- Docker Compose plugin, available as `docker compose`
- Ports `80` and `443` free on your machine

You do not need Node.js or `pnpm` installed locally for this test.

## 1. Create Local Production Env

```bash
cp .env.production.example .env.production
```

Edit `.env.production` for local testing:

```env
DOMAIN=localhost
ACME_EMAIL=dev@example.com
CORS_ORIGINS=https://localhost
MAX_FILE_SIZE_BYTES=1073741824
MAX_DOWNLOADS=10
MAX_EXPIRES_IN_MINUTES=10080
POSTGRES_USER=ghostdrop
POSTGRES_DB=ghostdrop
MINIO_BUCKET=ghostdrop
```

Using `DOMAIN=localhost` makes Caddy issue a local development certificate. Your browser may warn because the Caddy local CA is not trusted by your host OS. That is expected for this pre-domain test.

## 2. Create Secret Files

```bash
mkdir -p secrets
chmod 700 secrets
openssl rand -base64 32 > secrets/postgres_password.txt
openssl rand -base64 32 > secrets/redis_password.txt
openssl rand -hex 16 > secrets/minio_root_user.txt
openssl rand -base64 32 > secrets/minio_root_password.txt
chmod 600 secrets/*.txt
```

These files are ignored by git.

## 3. Build And Start

```bash
docker compose -f compose.prod.yaml --env-file .env.production up -d --build
```

This builds and starts:

- Caddy gateway plus built frontend
- Fastify API
- PostgreSQL
- Redis with password auth
- MinIO with pinned image version

Only Caddy is exposed publicly on the host.

## 4. Check Containers

```bash
docker compose -f compose.prod.yaml --env-file .env.production ps
```

Expected result: all services should be running, and Postgres/Redis should become healthy.

Watch logs if something fails:

```bash
docker compose -f compose.prod.yaml --env-file .env.production logs -f
```

## 5. Test Through Caddy

Browser:

```txt
https://localhost
```

If your browser shows a certificate warning, continue only for local testing.

API health check:

```bash
curl -k https://localhost/api/health
```

Expected response:

```json
{"status":"ok","redis":"up","postgres":"up","minIO":"up"}
```

## 6. Test Upload And Download

Use the UI at `https://localhost`:

1. Choose a small test file.
2. Upload it.
3. Copy the transfer code.
4. Open another browser tab or private window.
5. Enter the code.
6. Download the file.

This tests the real production path:

```txt
Browser -> Caddy -> API -> Redis/PostgreSQL/MinIO
```

## 7. Stop The Stack

```bash
docker compose -f compose.prod.yaml --env-file .env.production down
```

This stops containers but keeps named volumes, so stored data remains.

To delete local production test data too:

```bash
docker compose -f compose.prod.yaml --env-file .env.production down -v
```

## Notes

- This does not test public DNS or real Let's Encrypt certificates.
- Real certificate issuance requires a domain name pointing to a public IP reachable on ports `80` and `443`.
- This local test is still useful because it validates the production images, service wiring, secrets, private networking, migrations, Caddy proxying, and upload/download pipeline.

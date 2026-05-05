# GhostDrop

## Overview

GhostDrop is an **anonymous**, **temporary file-sharing platform** inspired by Wormhole and SendAnywhere.

Core user flow:

- Upload a file
- Receive a human-friendly transfer code
- Retrieve the file on another device using the code

Core design goals:

- Temporary storage
- Ephemeral transfers
- Streaming uploads/downloads
- Object storage architecture
- End-to-end encryption (planned, client-side)

## Stack

### Frontend:

- Vite
- Svelte 5 (Runes)
- TypeScript
- Tailwind CSS 4

### Backend:

- Fastify (ESM / NodeNext)
- TypeScript
- Zod
- PostgreSQL
- Redis (ephemeral state, rate limiting)
- MinIO (S3-compatible object storage)

Infrastructure:

- Docker Compose (dev + staging)
- Caddy (unified gateway / reverse proxy / TLS)

## Architecture

### Request path:

- Frontend (Svelte 5)
- Caddy gateway
- Fastify API
- PostgreSQL (metadata)
- Redis (TTL/rate limiting)
- MinIO (binary objects)

## Database

Main table:

- `transfers` (`id`, `code`, `object_key`, `original_filename`, `mime_type`, `size_bytes`, `download_count`, `max_downloads`, `expires_at`, `created_at`)

Migrations:

- Manual SQL migrations
- Compiled migration runner (`migrate.js` flow in production)

## Key Architectural Decisions

- Streaming-first pipeline: file data is piped to MinIO to reduce memory pressure.
- Unified gateway: Caddy serves UI and proxies `/api` to Fastify.
- NodeNext compatibility: API imports use `.js` extensions in TS source for ESM runtime compatibility after build.
- Mobile staging support: localtunnel bypass logic + dynamic IP awareness for device testing.

## Current Progress

Implemented:

- Dockerized local staging environment (`compose.staging.yaml`)
- Svelte 5 UI with mobile-optimized interactions
- Insecure-context awareness in UI
- Localtunnel/mobile testing logic
- Auto-migrating backend container flow

Known issue:

- Android local-IP HTTPS can fail due to stricter certificate validation and browser HTTPS-upgrade behavior.

Recent connectivity fix:

- Caddy staging was adjusted so LAN testing on HTTP does not auto-redirect to HTTPS.
- `http://<LAN-IP>` now serves directly for local device testing.

## Next Steps

- Client-side AES-GCM encryption before upload streaming starts
- Security hardening (replace default credentials with secret management)
- Integration tests for streaming pipeline
- Better local discovery (mDNS like `ghostdrop.local`)

## Coding Conventions

- TypeScript everywhere
- API imports must use `.js` extensions (ESM / NodeNext)
- Prefer Svelte Runes (`$state`, `$derived`) for frontend reactivity

## Local Staging Notes

- Containers expose Caddy on `80/443`.
- For Android local testing, prefer explicit `http://<LAN-IP>` if browser HTTPS upgrade causes cert errors.

## Public Testing via Cloudflare Tunnel

Quick way to share local staging on the internet.

Prerequisites:

- Staging stack running and reachable at `http://localhost:80`
- `cloudflared` installed

Install (`Windows`):

```powershell
winget install --id Cloudflare.cloudflared -e
```

Start tunnel:

```powershell
cloudflared tunnel --url http://localhost:80 --no-autoupdate
```

Stop tunnel:

```powershell
Get-Process cloudflared | Stop-Process -Force
```

Notes:

- Quick tunnel URLs are temporary (`https://*.trycloudflare.com`) and usually change on restart.
- Good for demos/testing.
- For stable production-like access, use a named tunnel with your domain.

## Project Structure

```
ghostdrop
├─ apps
│  ├─ api
│  │  ├─ Dockerfile
│  │  ├─ package.json
│  │  ├─ src
│  │  │  ├─ config
│  │  │  │  └─ env.ts
│  │  │  ├─ db
│  │  │  │  ├─ migrate.ts
│  │  │  │  └─ migrations
│  │  │  │     └─ 001_create_transfers.sql
│  │  │  ├─ routes
│  │  │  ├─ server.ts
│  │  │  ├─ services
│  │  │  │  ├─ cleanup.ts
│  │  │  │  ├─ pool.ts
│  │  │  │  ├─ redis.ts
│  │  │  │  ├─ storage.ts
│  │  │  │  └─ transfers.ts
│  │  │  └─ utils
│  │  │     ├─ generate_minio_object_key.ts
│  │  │     └─ generate_session_transfer_code.ts
│  │  └─ tsconfig.json
│  └─ web
│     ├─ index.html
│     ├─ package.json
│     ├─ public
│     │  ├─ favicon.svg
│     │  └─ icons.svg
│     ├─ README.md
│     ├─ src
│     │  ├─ app.css
│     │  ├─ App.svelte
│     │  ├─ assets
│     │  │  ├─ hero.png
│     │  │  ├─ svelte.svg
│     │  │  └─ vite.svg
│     │  ├─ lib
│     │  │  └─ Counter.svelte
│     │  └─ main.ts
│     ├─ svelte.config.js
│     ├─ tsconfig.app.json
│     ├─ tsconfig.json
│     ├─ tsconfig.node.json
│     └─ vite.config.ts
├─ Caddy.Dockerfile.staging
├─ caddyFile
├─ Caddyfile.staging
├─ Caddyfile.staging.bak
├─ compose.staging.yaml
├─ compose.yaml
├─ image.png
├─ package.json
├─ packages
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
└─ README.md

```
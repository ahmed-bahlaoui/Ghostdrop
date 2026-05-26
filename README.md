# GhostDrop: Free temporary and anonymous file sharing online
## Live at: https://ghostdrop.app

![Application Screenshot](screenshot.png)

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
- Optional client-side end-to-end encryption

## Features

- Anonymous transfer flow: upload a file, get a human-friendly code, and download from another device.
- Optional end-to-end encryption:
- Browser encrypts files with AES-GCM before upload.
- The API stores only ciphertext plus public encryption metadata.
- Encrypted transfers require the secure share link or decryption key to open.
- Code-only transfers remain available when E2EE is disabled.
- Ephemeral transfer sessions with expiration windows (`expires_at`) and cleanup support.
- Download limits per transfer (`max_downloads`) with download counters.
- Streaming-first binary pipeline:
- Upload stream goes directly to MinIO object storage.
- Download stream is served directly from MinIO.
- S3-compatible object storage backend using MinIO.
- Metadata persistence in PostgreSQL (`transfers` table).
- Redis-backed ephemeral state for code/session lookups and rate limiting.
- API hardening with Fastify + Zod validation + multipart limits.
- Unified Caddy gateway:
- Serves frontend static assets.
- Reverse proxies `/api` to Fastify.
- Applies response compression (`zstd`, `gzip`).
- Adds security headers (`X-Frame-Options`, `X-Content-Type-Options`).
- Multi-protocol edge transport via Caddy:
- HTTP/1.1 and HTTP/2 on standard endpoints.
- HTTP/3 support on HTTPS endpoints.
- QUIC transport support via UDP `443` exposure in staging (`443:443/udp`).
- Local/mobile testing support:
- LAN HTTP access mode for devices that fail local TLS validation.
- Localtunnel bypass header flow for mobile tunnel testing.
- Dockerized local staging environment (`compose.staging.yaml`) with auto-migrating backend startup flow.
- TypeScript-first monorepo across frontend and backend.


## Stack

<p align="left">
  <a href="https://github.com/thuongtruong109/icoziv">
    <img
      src="https://i.icoziv.workers.dev/icons?i=vite,svelte,ts,tailwindcss,fastify,ts,postgresql,redis,minio,docker&perline=5&t=light"
    />
  </a>
</p>

### Frontend:

[![Icoziv Skills](https://i.icoziv.workers.dev/icons?i=vite,svelte,ts,tailwindcss&t=light)](https://github.com/thuongtruong109/icoziv)

### Backend:

[![Icoziv Skills](https://i.icoziv.workers.dev/icons?i=fastify,ts,postgresql,redis,minio&t=light)](https://github.com/thuongtruong109/icoziv)

### Infrastructure:

[![Icoziv Skills](https://i.icoziv.workers.dev/icons?i=docker,digitalocean)](https://github.com/thuongtruong109/icoziv)

## Architecture

### Request path:

- Frontend (Svelte 5)
- Caddy gateway
- Fastify API
- PostgreSQL (metadata)
- Redis (TTL/rate limiting)
- MinIO (binary objects)

## User Flows

### Send a code-only transfer

```mermaid
sequenceDiagram
    actor Sender
    participant Web as Svelte app
    participant API as Fastify API
    participant Redis
    participant DB as PostgreSQL
    participant Store as MinIO

    Sender->>Web: Choose file and transfer options
    Web->>API: POST /transfers with metadata
    API->>DB: Create transfer row
    API->>Redis: Cache transfer:code:{code} with TTL
    API-->>Web: Return transfer code and expiry
    Web->>API: POST /transfers/{code}/upload with file stream
    API->>Redis: Validate upload session
    API->>Store: Stream object to bucket
    Store-->>API: Upload complete
    API-->>Web: Confirm upload
    Web-->>Sender: Show share code
```

### Send an encrypted transfer

```mermaid
sequenceDiagram
    actor Sender
    participant Web as Svelte app
    participant Crypto as Web Crypto API
    participant API as Fastify API
    participant Redis
    participant DB as PostgreSQL
    participant Store as MinIO

    Sender->>Web: Enable E2EE and choose file
    Web->>Crypto: Generate AES-GCM key and IV
    Crypto-->>Web: Return ciphertext and public IV
    Web->>API: POST /transfers with encrypted metadata
    API->>DB: Store ciphertext metadata and IV
    API->>Redis: Cache transfer:code:{code} with TTL
    API-->>Web: Return transfer code and expiry
    Web->>API: POST /transfers/{code}/upload with ciphertext stream
    API->>Store: Stream encrypted object to bucket
    API-->>Web: Confirm upload
    Web-->>Sender: Show secure link or code plus decryption key
```

### Receive, peek, and download

```mermaid
sequenceDiagram
    actor Receiver
    participant Web as Svelte app
    participant API as Fastify API
    participant Redis
    participant DB as PostgreSQL
    participant Store as MinIO
    participant Crypto as Web Crypto API

    Receiver->>Web: Enter transfer code or open secure link
    Web->>API: GET /transfers/{code}
    API->>Redis: Validate transfer code
    API->>DB: Read transfer metadata
    API-->>Web: Return filename, size, expiry, downloads, encryption metadata
    Web-->>Receiver: Show peek details
    Receiver->>Web: Click Download
    Web->>API: GET /transfers/{code}/download
    API->>Redis: Validate transfer code
    API->>DB: Check download limit
    API->>Store: Read object stream
    API->>DB: Increment download_count
    Store-->>API: Stream file bytes
    API-->>Web: Stream download response
    alt Encrypted transfer
        Web->>Crypto: Decrypt bytes with link/key and IV
        Crypto-->>Web: Return plaintext file
    end
    Web-->>Receiver: Save file
```

### Expiration and cleanup

```mermaid
flowchart TD
    A["Transfer created with expires_at and Redis TTL"] --> B{"Transfer still valid?"}
    B -- "Yes" --> C["Code can resolve through Redis"]
    C --> D["Metadata and object remain available"]
    B -- "No" --> E["Redis TTL removes code lookup"]
    E --> F["Cleanup worker runs every 5 minutes"]
    F --> G["Find expired transfer rows in PostgreSQL"]
    G --> H["Remove object from MinIO"]
    H --> I["Delete stale Redis keys"]
    I --> J["Delete expired metadata rows"]
```

## Database

#### Main table:
```mermaid
classDiagram
    class transfers {
        UUID id PK
        CHAR(7) code UNIQUE
        TEXT object_key
        TEXT original_filename
        TEXT mime_type
        BIGINT size_bytes
        BIGINT original_size_bytes nullable
        TEXT encryption_algorithm
        TEXT encryption_iv nullable
        INTEGER download_count
        INTEGER max_downloads nullable
        TIMESTAMPTZ expires_at
        TIMESTAMPTZ created_at
    }

    class constraints {
        size_bytes >= 0
        original_size_bytes IS NULL OR original_size_bytes >= 0
        encryption_algorithm none requires encryption_iv NULL
        encrypted transfers require encryption_iv
    }

    class indexes {
        idx_transfers_code
        idx_transfers_expires_at
    }

    transfers .. constraints : enforced by
    transfers .. indexes : optimized by
```

Encryption metadata notes:

- `size_bytes` is the stored object size. For encrypted transfers, this is the encrypted byte size.
- `original_size_bytes` stores the plaintext size for display when E2EE is enabled.
- `encryption_iv` is public AES-GCM metadata required for browser-side decryption.
- Decryption keys are never stored in PostgreSQL, Redis, MinIO, or API requests.

#### Migrations:

- Manual SQL migrations
- Compiled migration runner (`migrate.js` flow in production)

## Key Architectural Decisions

- Streaming-first pipeline: file data is piped to MinIO to reduce memory pressure.
- Unified gateway: Caddy serves UI and proxies `/api` to Fastify.
- NodeNext compatibility: API imports use `.js` extensions in TS source for ESM runtime compatibility after build.
- Mobile staging support: localtunnel bypass logic + dynamic IP awareness for device testing.
- E2EE is optional: the default code-only flow stays simple, while privacy-sensitive transfers can use a secure link or separate decryption key.
- URL fragments carry E2EE keys in secure links so keys are not sent to the backend by the browser.

## Roadmap

```mermaid
gantt
    title GhostDrop Development Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %b %Y

    section Foundation
    Backend infrastructure (API, DB, Redis, MinIO)    :done, 2026-03-01, 2026-03-21
    Streaming upload / download pipeline               :done, 2026-03-22, 2026-04-04
    Transfer codes & expiry & download limits          :done, 2026-04-05, 2026-04-11
    Dockerized staging & production compose            :done, 2026-04-12, 2026-04-18

    section Web App v1
    Svelte 5 UI (send / receive / peek)               :done, 2026-04-19, 2026-04-30
    Clipboard paste (text + image)                     :done, 2026-05-01, 2026-05-04
    Custom favicon & PWA icons                         :done, 2026-05-05, 2026-05-05

    section Security
    Optional AES-GCM E2EE encryption                   :done, 2026-05-06, 2026-05-14
    Secure share links (URL fragments)                 :done, 2026-05-15, 2026-05-16
    Rate limiting & CORS hardening                     :done, 2026-05-17, 2026-05-19

    section Mobile & SEO
    Android PWA + Web Share Target                     :done, 2026-05-20, 2026-05-22
    SEO meta / robots / sitemap                        :done, 2026-05-23, 2026-05-25
    Production security headers & bug fixes            :done, 2026-05-25, 2026-05-26

    section CLI Tool
    CLI research & design                              :active, 2026-05-27, 2026-06-07
    CLI v0.1 (upload / download / peek)                :2026-06-08, 2026-06-28
    CLI v1.0 (E2EE, progress bars, config file)        :2026-07-15, 2026-08-04

    section UI Makeover
    Design system & component library                  :2026-06-15, 2026-07-05
    New landing page & dark mode                       :2026-07-06, 2026-07-26
    Drag & drop, multi-file, progress indicators       :2026-07-27, 2026-08-16

    section SEO & Infra
    Advanced SEO (structured data, OG, performance)    :2026-07-01, 2026-07-21
    Cloudflare proxy & DDoS protection                 :2026-08-01, 2026-08-14
    Chunked encryption for large files                 :2026-08-15, 2026-09-04

    section Quality
    Malware scanning integration                       :2026-09-01, 2026-09-14
    Integration tests (streaming pipeline)             :2026-09-15, 2026-10-05
    CI/CD pipeline (GitHub Actions)                    :2026-10-01, 2026-10-14

    section Polish
    Monitoring (Prometheus + health alerts)            :2026-10-15, 2026-10-28
    File integrity checksums                           :2026-10-29, 2026-11-04
    mDNS discovery (ghostdrop.local)                   :2026-11-05, 2026-11-18
    Performance audit & optimization                   :2026-11-19, 2026-12-04
```

### Completed

- Full anonymous transfer flow with human-friendly codes and streaming pipeline.
- Optional browser-side AES-GCM encryption with URL-fragment key delivery.
- Expiry windows, download limits, automatic cleanup worker.
- Svelte 5 UI with mobile-optimized Peek/Download two-button flow.
- Clipboard paste (Ctrl+V text and images).
- Android PWA with Web Share Target support.
- Dockerized staging and production environments.
- SEO fundamentals (meta tags, robots, open graph, sitemap).
- Atomic download count enforcement (TOCTOU fix), upload completion guard, preview endpoint.

### Upcoming

| Feature | Description |
|---------|-------------|
| **CLI Tool** | Upload, download, and peek transfers from the terminal. E2EE support, progress bars, and config file for self-hosted endpoints. |
| **UI Makeover** | Full redesign with dark mode, drag & drop, multi-file support, upload progress indicators, and a polished landing page. |
| **SEO & Infra** | Structured data, performance optimization, Cloudflare proxy with DDoS protection. |
| **Chunked Encryption** | Stream large files through browser encryption in chunks to reduce memory pressure. |
| **Malware Scanning** | Server-side malware detection API integration before files become downloadable. |
| **Integration Tests** | Automated tests for upload/download pipeline, encrypted transfers, and rate limiting. |
| **CI/CD** | GitHub Actions for lint, type-check, and Docker image builds on every push. |
| **Monitoring** | Prometheus metrics endpoint with health-check alerting. |
| **File Integrity** | SHA-256 checksums in transfer metadata for download verification. |
| **mDNS Discovery** | Local network discovery via `ghostdrop.local` for LAN-only sharing without a server. |

### Known Issue

- Android local-IP HTTPS can fail due to stricter certificate validation. Use explicit `http://<LAN-IP>` for local device testing on the staging environment.

## Coding Conventions

- TypeScript everywhere
- API imports must use `.js` extensions (ESM / NodeNext)
- Prefer Svelte Runes (`$state`, `$derived`) for frontend reactivity

## Local Staging Notes

- Containers expose Caddy on `80/443`.
- For Android local testing, prefer explicit `http://<LAN-IP>` if browser HTTPS upgrade causes cert errors.

## Deployment Operations

- Production server setup, testing, maintenance, backups, and troubleshooting are documented in [`docs/server-ops.md`](docs/server-ops.md).

## Self-Hosting / Local Deployment

GhostDrop is designed to be self-hosted. If the hosted instance at ghostdrop.app ever goes offline, you can run your own instance with Docker in minutes.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose (v2+)
- A domain name pointing to your server (for production)
- Ports 80 and 443 available (for production)

### Quick Start (Local Staging)

For local testing and development:

```bash
git clone https://github.com/your-org/ghostdrop.git
cd ghostdrop
docker compose -f compose.staging.yaml up -d --build
```

Visit `https://localhost` (accept the self-signed certificate warning).

### Production Deployment

1. Clone the repo onto your server:
   ```bash
   git clone https://github.com/your-org/ghostdrop.git
   cd ghostdrop
   ```

2. Copy and configure the environment file:
   ```bash
   cp .env.production.example .env.production
   ```
   Edit `.env.production` with your domain, credentials, and S3 storage details.

3. Create Docker secrets:
   ```bash
   mkdir -p secrets
   echo "your-postgres-password" > secrets/postgres_password.txt
   echo "your-redis-password" > secrets/redis_password.txt
   echo "your-minio-access-key" > secrets/minio_access_key.txt
   echo "your-minio-secret-key" > secrets/minio_secret_key.txt
   ```

4. Start the stack:
   ```bash
   docker compose --env-file .env.production -f compose.prod.yaml up -d --build
   ```

Caddy will automatically provision Let's Encrypt TLS certificates for your domain.

### Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 1 core | 2+ cores |
| RAM | 512 MB | 2 GB |
| Disk | 10 GB | 50 GB+ (depends on expected transfer volume) |
| OS | Any Linux with Docker | Ubuntu 22.04+ |

### Architecture Notes for Self-Hosters

- **Storage:** Files are stored in MinIO (S3-compatible). You can swap it for any S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2) by changing `MINIO_*` environment variables to your provider's endpoint and credentials.
- **Database:** PostgreSQL stores transfer metadata and cleans itself up automatically via the cleanup worker.
- **Ephemeral state:** Redis handles rate limiting and transfer code lookups with automatic TTL expiry.
- **Gateway:** Caddy handles TLS, reverse proxy, and static file serving in a single container.
- **Cleanup:** A background worker runs every 5 minutes to purge expired transfers from storage, database, and Redis.
- **No persistent user data:** GhostDrop is anonymous by design — no accounts, no user tables, no long-term storage. Every transfer expires automatically.

Detailed production operations (firewall, DNS, backups, monitoring) are in [`docs/server-ops.md`](docs/server-ops.md).

## Built with ❤️ and a lot of ☕

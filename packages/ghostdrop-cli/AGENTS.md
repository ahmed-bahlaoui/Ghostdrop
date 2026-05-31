# GhostDrop CLI — AI Agent Context

## Package Overview

`ghostdrop-cli` is the terminal client for GhostDrop. It communicates with the GhostDrop API using the same contract as the web frontend: two-step upload (handshake + binary stream), metadata peek, and streaming download. It supports optional AES-256-GCM client-side encryption using Node.js `crypto`, producing key and IV formats byte-compatible with the browser's Web Crypto API.

## Architecture

```
src/
  index.ts                   Commander entry point, wires subcommands
  commands/
    menu.ts                  Interactive @inquirer/prompts loop (send / receive / quit)
    send.ts                  Upload flow: prompt → encrypt? → handshake → upload → output
    receive.ts               Download flow: peek metadata → prompt → download → decrypt?
  lib/
    api.ts                   HTTP client (fetch) — handshakeTransfer, uploadFile, fetchMetadata, downloadFile
    crypto.ts                AES-256-GCM encrypt/decrypt via node:crypto (matches Web Crypto output)
    config.ts                Env var resolution (GHOSTDROP_API_URL, GHOSTDROP_WEB_URL)
    format.ts                Transfer code formatting, size/expiry display, share link builder, metadata normalizer
    qr.ts                    Terminal QR code generation (qrcode-terminal, CJS via createRequire)
```

## Invocation

```
ghostdrop                    # Interactive menu (no args)
ghostdrop send [file]        # Direct send (with options)
ghostdrop receive [code]     # Direct receive (with options)
```

## Commands

### send

```
ghostdrop send [file] [options]

Options:
  -e, --encrypt              Enable AES-256-GCM end-to-end encryption
  --expiry <minutes>         Transfer expiry (60, 1440, 4320, 10080)
  --max-downloads <number>   Max downloads before auto-deletion (1, 3, 5, 10)
```

Flow:
1. If file path provided as argument, skips file prompt
2. If --encrypt: reads file, encrypts with AES-256-GCM, produces encrypted buffer
3. POST /transfers (handshake) with metadata (filename, size, mimeType, encryption fields)
4. POST /transfers/:code/upload (multipart binary)
5. Outputs transfer code (and share link + QR if encrypted)

### receive

```
ghostdrop receive [code] [options]

Options:
  -k, --key <key>            Decryption key (base64url, from E2EE share link fragment)
  -o, --output <path>        Output file path
```

Flow:
1. If code provided, skips code prompt
2. GET /transfers/:code (peek metadata, does NOT consume download slot)
3. Displays metadata table (filename, type, size, downloads, expiry, encryption)
4. If encrypted and --key not provided, prompts for key
5. GET /transfers/:code/download (streams to temp file)
6. If encrypted: decrypts temp file, writes decrypted output, removes temp
7. If unencrypted: renames temp to output path

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `GHOSTDROP_API_URL` | `http://localhost/api` | API base URL (Caddy gateway or direct) |
| `GHOSTDROP_WEB_URL` | `http://localhost` | Web UI base URL (for E2EE share links) |
| `GHOSTDROP_CLI_NO_QR` | unset | Set to `1` to suppress terminal QR codes |

## Encryption (AES-256-GCM)

- Key: 32 random bytes, exported as base64url (no padding)
- IV: 12 random bytes, exported as base64url
- Ciphertext format: `encrypted || authTag` (16-byte tag appended, matching Web Crypto's `encrypt()` output)
- Node `crypto.createCipheriv('aes-256-gcm', key, iv)` → `cipher.getAuthTag()` appended after `cipher.final()`
- Share link format: `{webUrl}/#transfer={CODE}&key={KEY_BASE64URL}`
- Key is in the URL fragment — never sent to the server

## Development Commands

```bash
cd packages/ghostdrop-cli
pnpm dev        # tsx src/index.ts (interactive menu)
pnpm build      # tsc → dist/
pnpm start      # node dist/index.js

# Direct subcommand testing
node dist/index.js send ./file.pdf
node dist/index.js send ./file.pdf -e --expiry 1440 --max-downloads 3
node dist/index.js receive ABC-123
node dist/index.js receive ABC-123 -k <key> -o ./output.pdf
```

## Demo

```bash
# Requires Docker staging stack running:
docker compose -f compose.staging.yaml up -d --build

# Build the CLI:
pnpm --filter ghostdrop-cli build

# Run the orchestrated demo script:
.\demo.ps1
```

`demo.ps1` (project root) orchestrates a full end-to-end flow: creates test file → shows `--help` → unencrypted send+receive (SHA256 verified) → E2EE send (encryption, share link) → E2EE receive+decrypt (SHA256 verified). Each CLI subcommand is echoed before execution.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Commander entry point (menu/send/receive) |
| `src/commands/menu.ts` | Interactive menu loop |
| `src/commands/send.ts` | Upload flow with options and E2EE |
| `src/commands/receive.ts` | Download flow with peek, decrypt, file output |
| `src/lib/api.ts` | HTTP client (fetch-based, streaming downloads) |
| `src/lib/crypto.ts` | AES-256-GCM via node:crypto |
| `src/lib/format.ts` | Code formatting, size/expiry display, share link builder |
| `src/lib/config.ts` | Env var resolution |
| `src/lib/qr.ts` | Terminal QR code (createRequire for CJS module) |
| `../../demo.ps1` | Orchestrated demo script (project root) |

## Coding Conventions

- TypeScript with `module: nodenext`, ESM, `.js` extensions in relative imports
- `verbatimModuleSyntax: true` — no import transforms, type-only imports use `import type`
- CJS interop uses `createRequire` from `node:module` (see `qr.ts`)
- Node.js `crypto` module for encryption (not Web Crypto)
- Native `fetch` (Node 18+) for HTTP
- Commander for CLI parsing, @inquirer/prompts for interactive input
- Streaming downloads via `Readable.fromWeb(response.body).pipe(writeStream)`

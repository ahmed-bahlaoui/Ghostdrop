

## Project folder structure
```
ghostdrop
├─ apps
│  ├─ api
│  │  ├─ package.json
│  │  ├─ src
│  │  │  ├─ config
│  │  │  ├─ db
│  │  │  │  ├─ migrate.ts
│  │  │  │  ├─ migrations
│  │  │  │  │  └─ 001_create_transfers.sql
│  │  │  │  └─ pool.ts
│  │  │  ├─ index.ts
│  │  │  ├─ routes
│  │  │  ├─ services
│  │  │  │  ├─ minio.ts
│  │  │  │  ├─ pool.ts
│  │  │  │  ├─ postgres.ts
│  │  │  │  ├─ redis.ts
│  │  │  │  └─ storage.ts
│  │  │  └─ utils
│  │  │     ├─ generate_minio_object_key.ts
│  │  │     └─ generate_session_transfer_code.ts
│  │  └─ tsconfig.json
│  └─ web
│     ├─ AGENTS.md
│     ├─ app
│     │  ├─ favicon.ico
│     │  ├─ globals.css
│     │  ├─ layout.tsx
│     │  └─ page.tsx
│     ├─ CLAUDE.md
│     ├─ eslint.config.mjs
│     ├─ next-env.d.ts
│     ├─ next.config.ts
│     ├─ package.json
│     ├─ pnpm-lock.yaml
│     ├─ postcss.config.mjs
│     ├─ public
│     │  ├─ file.svg
│     │  ├─ globe.svg
│     │  ├─ next.svg
│     │  ├─ vercel.svg
│     │  └─ window.svg
│     ├─ README.md
│     └─ tsconfig.json
├─ compose.yaml
├─ package.json
├─ packages
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
└─ README.md

```
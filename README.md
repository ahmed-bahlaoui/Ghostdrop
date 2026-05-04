## Project folder structure

```
ghostdrop
├─ apps
│  ├─ api
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
├─ caddyFile
├─ compose.yaml
├─ package.json
├─ packages
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
└─ README.md

```

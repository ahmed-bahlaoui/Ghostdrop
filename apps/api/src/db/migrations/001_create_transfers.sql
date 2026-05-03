-- Active: 1777730597503@@127.0.0.1@5433@mydb
--SETUP EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SELECT NOW();

CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    code CHAR(7) NOT NULL UNIQUE, -- Unique because code must Identify only one transfer.
    object_key TEXT NOT NULL, -- MinIO object path.
    original_filename TEXT NOT NULL, -- Original filename provided by the user.
    mime_type TEXT NOT NULL, -- For file type, previews,  validation, content handeling
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    download_count INTEGER NOT NULL DEFAULT 0,
    max_downloads INTEGER DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfers_expires_at ON transfers (expires_at);

CREATE INDEX IF NOT EXISTS idx_transfers_code ON transfers (code);
-- Optional, but aids lookups
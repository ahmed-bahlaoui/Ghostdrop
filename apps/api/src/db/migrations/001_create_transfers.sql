-- Active: 1777730597503@@127.0.0.1@5433@mydb
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SELECT NOW();

CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) NOT NULL UNIQUE, -- Unique because code must Identify only one transfer.
    object_key TEXT NOT NULL, -- MinIO object path.
    original_filename TEXT NOT NULL, -- Original filename provided by the user.
    mime_type TEXT NOT NULL, -- For file type, previews,  validation, content handeling
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    download_count INTEGER NOT NULL DEFAULT 0,
    max_downloads INTEGER,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO transfers (
    id,
    code,
    object_key,
    original_filename,
    mime_type,
    size_bytes,
    download_count,
    max_downloads,
    expires_at,
    created_at
) VALUES (
    gen_random_uuid(),
    'fake-transfer-01',
    'transfers/fake-transfer-01/sample.pdf',
    'sample.pdf',
    'application/pdf',
    48291,
    0,
    3,
    TIMESTAMPTZ '2030-01-01 00:00:00+00',
    TIMESTAMPTZ '2026-05-02 00:00:00+00'
);
INSERT INTO
    transfers (
        id,
        code,
        object_key,
        original_filename,
        mime_type,
        size_bytes,
        download_count,
        max_downloads,
        expires_at,
        created_at
    )
VALUES (
        gen_random_uuid (),
        'fake-transfer-02',
        'transfers/fake-transfer-02/file.txt',
        'sample.txt',
        'text/plain',
        10512,
        10,
        30,
        TIMESTAMPTZ '2031-01-01 00:00:00+00',
        TIMESTAMPTZ '2026-05-02 12:00:00+00'
    );

SELECT * FROM transfers LIMIT 10;


DELETE FROM transfers WHERE code IN ('fake-transfer-01', 'fake-transfer-02');
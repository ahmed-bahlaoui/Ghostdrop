-- Setup Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Metadata Table for File Transfers
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    code CHAR(7) NOT NULL UNIQUE, -- Human-friendly code (XXX-XXX)
    object_key TEXT NOT NULL, -- MinIO object path
    original_filename TEXT NOT NULL, -- Original filename for download
    mime_type TEXT NOT NULL, -- File content type
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    download_count INTEGER NOT NULL DEFAULT 0,
    max_downloads INTEGER DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Testing what is already in our db:
-- SELECT mime_type, original_filename,  code  FROM transfers ORDER BY created_at DESC;

-- Performance Indexes
-- Index for finding transfers by their short code (the primary retrieval method)
CREATE INDEX IF NOT EXISTS idx_transfers_code ON transfers (code);

-- Index for the cleanup worker to efficiently find and delete expired transfers
CREATE INDEX IF NOT EXISTS idx_transfers_expires_at ON transfers (expires_at);
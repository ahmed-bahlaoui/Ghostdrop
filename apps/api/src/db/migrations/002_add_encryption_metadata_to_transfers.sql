ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS encryption_algorithm TEXT NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS encryption_iv TEXT,
ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT CHECK (
    original_size_bytes IS NULL
    OR original_size_bytes >= 0
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'transfers_encryption_metadata_check'
    ) THEN
        ALTER TABLE transfers
        ADD CONSTRAINT transfers_encryption_metadata_check
        CHECK (
            (
                encryption_algorithm = 'none'
                AND encryption_iv IS NULL
            )
            OR
            (
                encryption_algorithm <> 'none'
                AND encryption_iv IS NOT NULL
            )
        );
    END IF;
END $$;
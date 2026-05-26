ALTER TABLE transfers
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'created'
CHECK (status IN ('created', 'uploaded'));

-- Ensure existing transfers with uploaded files are marked correctly.
-- Any transfer record that exists before this migration
-- likely already has an object in MinIO, so set to 'uploaded'.
UPDATE transfers SET status = 'uploaded' WHERE status = 'created';

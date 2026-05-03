import pool from "./pool.ts";

export interface Transfer {
	id: string;
	code: string;
	object_key: string;
	original_filename: string;
	mime_type: string;
	size_bytes: string; // BIGINT comes back as string from pg
	download_count: number;
	max_downloads: number | null;
	expires_at: Date;
	created_at: Date;
}

export interface CreateTransferInput {
	code: string;
	object_key: string;
	original_filename: string;
	mime_type: string;
	size_bytes: number;
	max_downloads?: number;
	expires_at: Date;
}

/**
 * Creates a new transfer record in the database.
 */
export async function createTransfer(
	input: CreateTransferInput,
): Promise<Transfer> {
	const query = `
        INSERT INTO transfers (
            code, object_key, original_filename, mime_type, size_bytes, max_downloads, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;

	const values = [
		input.code,
		input.object_key,
		input.original_filename,
		input.mime_type,
		input.size_bytes,
		input.max_downloads ?? 1,
		input.expires_at,
	];

	const result = await pool.query<Transfer>(query, values);
	return result.rows[0] as Transfer;
}

/**
 * Retrieves a transfer record by its unique human-friendly code.
 */
export async function getTransferByCode(
	code: string,
): Promise<Transfer | null> {
	const query = "SELECT * FROM transfers WHERE code = $1 LIMIT 1";
	const result = await pool.query<Transfer>(query, [code]);
	return result.rows[0] || null;
}

/**
 * Increments the download count for a transfer.
 */
export async function incrementDownloadCount(id: string): Promise<void> {
	await pool.query(
		"UPDATE transfers SET download_count = download_count + 1 WHERE id = $1",
		[id],
	);
}

/**
 * Finds all transfers that have passed their expiration date.
 */
export async function getExpiredTransfers(): Promise<Transfer[]> {
	const query = "SELECT * FROM transfers WHERE expires_at < NOW()";
	const result = await pool.query<Transfer>(query);
	return result.rows;
}

/**
 * Permanently removes a transfer from the database.
 */
export async function deleteTransfer(id: string): Promise<void> {
	await pool.query("DELETE FROM transfers WHERE id = $1", [id]);
}

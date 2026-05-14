import pool from "./pool.js";

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
	encryption_algorithm: string;
	encryption_iv: string | null;
	original_size_bytes: string | null;
}

export interface CreateTransferInput {
	code: string;
	object_key: string;
	original_filename: string;
	mime_type: string;
	size_bytes: number;
	max_downloads?: number;
	expires_at: Date;
	encryption_algorithm?: string | undefined;
	encryption_iv?: string | null | undefined;
	original_size_bytes?: number | undefined;
}

export async function testPostgres(): Promise<void> {
	try {
		await pool.query("SELECT NOW();");
	} catch (err) {
		console.error("Database connection test failed:", err);
		throw err;
	}
}
/**
 * Creates a new transfer record in the database.
 */
export async function createTransfer(
	input: CreateTransferInput,
): Promise<Transfer> {
	const query = `
        INSERT INTO transfers (
            code,
			object_key,
			original_filename,
			mime_type,
			size_bytes,
			max_downloads,
			expires_at,
			encryption_algorithm,
			encryption_iv,
			original_size_bytes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
		input.encryption_algorithm ?? "none",
		input.encryption_iv ?? null,
		input.original_size_bytes ?? null,
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

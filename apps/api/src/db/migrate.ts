import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../services/pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureConnection(): Promise<void> {
	try {
		const result = await pool.query("SELECT NOW()");
		console.log("Connected successfully:", result.rows[0]);
	} catch (err) {
		console.error("Database connection error:", err);
		throw err; // stop migration if we can't connect
	}
}

async function ensureMigrationsTable(): Promise<void> {
	const query = `
        CREATE TABLE IF NOT EXISTS migrations (
            id          SERIAL PRIMARY KEY,
            filename    TEXT NOT NULL UNIQUE,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`;
	await pool.query(query);
	console.log("Migrations table ensured.");
}

async function getAppliedMigrations(): Promise<Set<string>> {
	const result = await pool.query<{ filename: string }>(
		"SELECT filename FROM migrations ORDER BY filename",
	);
	return new Set(result.rows.map((r) => r.filename));
}

async function loadMigrationFiles(): Promise<string[]> {
	const migrationsDir = path.join(__dirname, "migrations");
	const files = await fs.readdir(migrationsDir);
	return files.filter((f) => f.endsWith(".sql")).sort(); // alphabetical = chronological if you name them 001_, 002_, etc.
}

async function migrate() {
	await ensureConnection();
	await ensureMigrationsTable();

	// Load all .sql files and already-applied filenames
	const allFiles = await loadMigrationFiles();
	const applied = await getAppliedMigrations();

	const pending = allFiles.filter((f) => !applied.has(f));

	if (pending.length === 0) {
		console.log("No pending migrations.");
		await pool.end();
		return;
	}

	console.log(`Found ${pending.length} pending migration(s):`, pending);

	const migrationsDir = path.join(__dirname, "migrations");
	const client = await pool.connect();

	try {
		await client.query("BEGIN");

		for (const filename of pending) {
			const filepath = path.join(migrationsDir, filename);
			const sql = await fs.readFile(filepath, "utf-8");

			console.log(`Applying: ${filename}`);
			await client.query(sql);

			await client.query("INSERT INTO migrations (filename) VALUES ($1)", [
				filename,
			]);

			console.log(`✓ Applied: ${filename}`);
		}

		await client.query("COMMIT");
		console.log("All migrations applied successfully.");
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("Migration failed, rolled back:", err);
		throw err;
	} finally {
		client.release();
		await pool.end();
	}
}

migrate();

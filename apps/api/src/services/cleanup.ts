import { deleteObject } from "./storage.ts";
import { getExpiredTransfers, deleteTransfer } from "./transfers.ts";

/**
 * The Cleanup Worker:
 * Periodically sweeps the database for expired records,
 * removes their files from MinIO, and then purges the DB metadata.
 */
export async function runCleanup(): Promise<void> {
	console.log("[Cleanup] Starting expiration sweep...");

	try {
		const expired = await getExpiredTransfers();

		if (expired.length === 0) {
			console.log("[Cleanup] No expired transfers found.");
			return;
		}

		console.log(`[Cleanup] Found ${expired.length} expired transfer(s).`);

		for (const transfer of expired) {
			console.log(`[Cleanup] Cleaning up transfer: ${transfer.code}`);

			// 1. Delete from MinIO
			await deleteObject(transfer.object_key);

			// 2. Delete from Database
			await deleteTransfer(transfer.id);

			console.log(`[Cleanup] ✓ Transfer ${transfer.code} fully purged.`);
		}
	} catch (err) {
		console.error("[Cleanup] Fatal error during cleanup sweep:", err);
	}
}

/**
 * Starts the cleanup worker on a defined interval.
 */
export function startCleanupWorker(intervalMs: number = 60000 * 5) {
	console.log(
		`[Cleanup] Worker started. Interval: ${intervalMs / 60000} minutes`,
	);

	// Run immediately on start
	runCleanup();

	// Then run periodically
	setInterval(runCleanup, intervalMs);
}

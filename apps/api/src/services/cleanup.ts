import redis from "./redis.js";
import { deleteObject } from "./storage.js";
import { deleteTransfer, getExpiredTransfers } from "./transfers.js";

const CLEANUP_BATCH_SIZE = 100;

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Runs a single cleanup sweep, processing transfers in batches.
 */
async function runCleanupSweep(): Promise<void> {
	try {
		let totalCleaned = 0;

		while (true) {
			const expired = await getExpiredTransfers(CLEANUP_BATCH_SIZE);

			if (expired.length === 0) {
				break;
			}

			for (const transfer of expired) {
				console.log(`[Cleanup] Cleaning up transfer: ${transfer.code}`);

				const deleted = await deleteObject(transfer.object_key);
				if (!deleted) {
					console.warn(`[Cleanup] Skipping DB/Redis cleanup for ${transfer.code} — MinIO delete failed`);
					continue;
				}

				await deleteTransfer(transfer.id);
				await redis.del(`transfer:code:${transfer.code}`);
				totalCleaned++;

				console.log(`[Cleanup] ✓ Transfer ${transfer.code} fully purged.`);
			}
		}

		if (totalCleaned > 0) {
			console.log(`[Cleanup] Sweep complete. Cleaned ${totalCleaned} transfer(s).`);
		}
	} catch (err) {
		console.error("[Cleanup] Fatal error during cleanup sweep:", err);
	}
}

function scheduleNextRun(intervalMs: number) {
	timer = setTimeout(async () => {
		if (!running) {
			running = true;
			try {
				await runCleanupSweep();
			} catch {
				// already logged in runCleanupSweep
			}
			running = false;
		}
		scheduleNextRun(intervalMs);
	}, intervalMs);
}

/**
 * Starts the cleanup worker on a defined interval.
 * Uses setTimeout chaining to prevent overlapping runs.
 */
export function startCleanupWorker(intervalMs: number = 60000 * 5) {
	console.log(
		`[Cleanup] Worker started. Interval: ${intervalMs / 60000} minutes`,
	);

	runCleanupSweep();
	scheduleNextRun(intervalMs);
}

export function stopCleanupWorker() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
}

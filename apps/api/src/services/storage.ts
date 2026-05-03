import { Client } from "minio";

const BUCKET_NAME = "ghostdrop-transfers";

const minio = new Client({
	endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
	port: Number(process.env.MINIO_PORT) || 9000,
	useSSL: false,
	accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
	secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

/**
 * Ensures the required storage bucket exists in MinIO.
 * Should be called during application startup.
 */
export async function initializeStorage(): Promise<void> {
	try {
		const exists = await minio.bucketExists(BUCKET_NAME);
		if (!exists) {
			await minio.makeBucket(BUCKET_NAME);
			console.log(`[Storage] Bucket "${BUCKET_NAME}" created successfully.`);
		} else {
			console.log(`[Storage] Bucket "${BUCKET_NAME}" already exists.`);
		}
	} catch (err) {
		console.error("[Storage] Failed to initialize MinIO bucket:", err);
		throw err;
	}
}

/**
 * Deletes an object from the storage bucket.
 */
export async function deleteObject(objectKey: string): Promise<void> {
	try {
		await minio.removeObject(BUCKET_NAME, objectKey);
		console.log(`[Storage] Object deleted: ${objectKey}`);
	} catch (err) {
		console.error(`[Storage] Failed to delete object ${objectKey}:`, err);
		// We don't throw here so the cleanup worker can continue with other files
	}
}

export { BUCKET_NAME };
export default minio;

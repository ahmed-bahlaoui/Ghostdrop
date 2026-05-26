import { Client } from "minio";
import { getEnv } from "../config/env.js";

const BUCKET_NAME = getEnv("MINIO_BUCKET") || "ghostdrop-transfers";

const minio = new Client({
	endPoint: getEnv("MINIO_ENDPOINT") || "127.0.0.1",
	port: Number(getEnv("MINIO_PORT")) || 9000,
	useSSL: getEnv("MINIO_USE_SSL") === "true",
	accessKey: getEnv("MINIO_ACCESS_KEY") || "minioadmin",
	secretKey: getEnv("MINIO_SECRET_KEY") || "minioadmin",
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
 * Returns true if the object was deleted, false if the operation failed.
 */
export async function deleteObject(objectKey: string): Promise<boolean> {
	try {
		await minio.removeObject(BUCKET_NAME, objectKey);
		console.log(`[Storage] Object deleted: ${objectKey}`);
		return true;
	} catch (err) {
		console.error(`[Storage] Failed to delete object ${objectKey}:`, err);
		return false;
	}
}

export { BUCKET_NAME };
export default minio;

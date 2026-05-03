import { extname } from "node:path";
import { v4 as uuidv4 } from "uuid";

/**
 * Generates a unique object key for storing files in MinIO.
 * Uses a UUID to prevent collisions and node:path to handle extensions safely.
 *
 * @param originalFilename - The original name of the uploaded file
 * @param folder - The target folder in the bucket (default: "uploads")
 * @returns A formatted object key (e.g., "uploads/550e8400-e29b-41d4-a716-446655440000.txt")
 */
export function generateObjectKey(
	originalFilename: string,
	folder: string = "uploads",
): string {
	const extension = extname(originalFilename);
	const uniqueId = uuidv4();

	return `${folder}/${uniqueId}${extension}`;
}

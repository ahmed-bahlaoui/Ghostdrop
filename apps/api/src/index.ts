import Fastify from "fastify";
import { z } from "zod";
import { initializeStorage } from "./services/storage.ts";
import { generateTransferCode } from "./utils/generate_session_transfer_code.ts";
import { generateObjectKey } from "./utils/generate_minio_object_key.ts";
import { createTransfer, getTransferByCode } from "./services/transfers.ts";

const fastify = Fastify({
	logger: true,
});

// Validation Schemas
const CreateTransferSchema = z.object({
	filename: z.string().min(1).max(255),
	size: z.number().int().positive(),
	mimeType: z.string().min(1),
	maxDownloads: z.number().int().positive().optional().default(1),
	expiresInMinutes: z.number().int().positive().optional().default(60), // Default 1 hour
});

fastify.get("/", async () => {
	return { name: "GhostDrop API", version: "1.0.0" };
});

fastify.get("/health", async () => {
	return { status: "ok" };
});

/**
 * Handshake: Create a transfer session
 * Returns a human-friendly code and the object key for the upcoming upload.
 */
fastify.post("/transfers", async (request, reply) => {
	const parseResult = CreateTransferSchema.safeParse(request.body);

	if (!parseResult.success) {
		return reply.status(400).send({
			error: "Invalid input",
			details: parseResult.error.format(),
		});
	}

	const { filename, size, mimeType, maxDownloads, expiresInMinutes } =
		parseResult.data;

	const code = generateTransferCode();
	const objectKey = generateObjectKey(filename);
	const expiresAt = new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

	try {
		const transfer = await createTransfer({
			code,
			object_key: objectKey,
			original_filename: filename,
			mime_type: mimeType,
			size_bytes: size,
			max_downloads: maxDownloads,
			expires_at: expiresAt,
		});

		return {
			code: transfer.code,
			objectKey: transfer.object_key,
			expiresAt: transfer.expires_at,
		};
	} catch (err) {
		fastify.log.error(err);
		return reply
			.status(500)
			.send({ error: "Failed to create transfer session" });
	}
});

/**
 * Metadata: Retrieve transfer info by code
 */
fastify.get("/transfers/:code", async (request, reply) => {
	const { code } = request.params as { code: string };

	const transfer = await getTransferByCode(code.toUpperCase());

	if (!transfer) {
		return reply.status(404).send({ error: "Transfer not found" });
	}

	// Check if expired
	if (new Date() > new Date(transfer.expires_at)) {
		return reply.status(410).send({ error: "Transfer has expired" });
	}

	return {
		filename: transfer.original_filename,
		size: Number(transfer.size_bytes),
		mimeType: transfer.mime_type,
		expiresAt: transfer.expires_at,
		downloadCount: transfer.download_count,
		maxDownloads: transfer.max_downloads,
	};
});

/**
 * Start the server!
 */
const start = async () => {
	try {
		// Initialize Storage (ensure bucket exists)
		await initializeStorage();

		await fastify.listen({ port: 3001, host: "0.0.0.0" });
		console.log("Server listening on http://localhost:3001");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();

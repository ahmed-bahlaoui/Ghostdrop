import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import minio, { BUCKET_NAME, initializeStorage } from "./services/storage.ts";
import { generateTransferCode } from "./utils/generate_session_transfer_code.ts";
import { generateObjectKey } from "./utils/generate_minio_object_key.ts";
import {
	createTransfer,
	getTransferByCode,
	incrementDownloadCount,
} from "./services/transfers.ts";
import redis from "./services/redis.ts";
import { startCleanupWorker } from "./services/cleanup.ts";

const fastify = Fastify({
	logger: true,
});

// Register Rate Limiting (using Redis)
fastify.register(rateLimit, {
	global: true,
	max: 100, // 100 requests per minute
	timeWindow: "1 minute",
	redis,
	keyGenerator: (request) => {
		// Trust the IP from Caddy (X-Forwarded-For)
		return (
			(request.headers["x-forwarded-for"] as string) || request.ip || "unknown"
		);
	},
});

// Register Multipart for streaming uploads
fastify.register(multipart, {
	limits: {
		fileSize: 10 * 1024 * 1024 * 1024, // 10GB max for streaming
	},
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
	try {
		await redis.ping();
		return { status: "ok", redis: "up" };
	} catch (err) {
		console.log("Redis health check failed:", err);
		return { status: "error", redis: "down" };
	}
});

/**
 * Handshake: Create a transfer session
 */
fastify.post(
	"/transfers",
	{
		config: {
			rateLimit: {
				max: 5,
				timeWindow: "1 minute",
			},
		},
	},
	async (request, reply) => {
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

		await redis.set(
			`transfer:code:${code}`,
			transfer.id,
			"EX",
			expiresInMinutes * 60,
		);

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
 * Metadata retrieval
 */
fastify.get("/transfers/:code", async (request, reply) => {
	const { code } = request.params as { code: string };
	const upperCode = code.toUpperCase();

	const transferId = await redis.get(`transfer:code:${upperCode}`);
	if (!transferId) {
		return reply.status(404).send({ error: "Transfer not found or expired" });
	}

	const transfer = await getTransferByCode(upperCode);
	if (!transfer) {
		return reply.status(404).send({ error: "Transfer metadata missing" });
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
 * Binary Upload Pipeline (Stream to MinIO)
 */
fastify.post("/transfers/:code/upload", async (request, reply) => {
	const { code } = request.params as { code: string };
	const upperCode = code.toUpperCase();

	// 1. Validate Session
	const transferId = await redis.get(`transfer:code:${upperCode}`);
	if (!transferId) {
		return reply
			.status(404)
			.send({ error: "Invalid or expired upload session" });
	}

	const transfer = await getTransferByCode(upperCode);
	if (!transfer) {
		return reply.status(404).send({ error: "Transfer metadata not found" });
	}

	// 2. Get the stream
	const data = await request.file();
	if (!data) {
		return reply.status(400).send({ error: "No file provided" });
	}

	try {
		// 3. Pipe to MinIO
		// We use the known size from the metadata handshake for efficiency
		await minio.putObject(
			BUCKET_NAME,
			transfer.object_key,
			data.file,
			Number(transfer.size_bytes),
			{ "Content-Type": transfer.mime_type },
		);

		return { message: "Upload successful", code: transfer.code };
	} catch (err) {
		fastify.log.error(err);
		return reply.status(500).send({ error: "Storage upload failed" });
	}
});

/**
 * Binary Download Pipeline (Stream from MinIO)
 */
fastify.get("/transfers/:code/download", async (request, reply) => {
	const { code } = request.params as { code: string };
	const upperCode = code.toUpperCase();

	// 1. Validate
	const transferId = await redis.get(`transfer:code:${upperCode}`);
	if (!transferId) {
		return reply.status(404).send({ error: "Transfer not found or expired" });
	}

	const transfer = await getTransferByCode(upperCode);
	if (!transfer) {
		return reply.status(404).send({ error: "Metadata missing" });
	}

	// 2. Check Download Limits
	if (
		transfer.max_downloads &&
		transfer.download_count >= transfer.max_downloads
	) {
		return reply.status(403).send({ error: "Download limit reached" });
	}

	try {
		// 3. Get stream from MinIO
		const stream = await minio.getObject(BUCKET_NAME, transfer.object_key);

		// 4. Set Headers
		reply.header("Content-Type", transfer.mime_type);
		reply.header("Content-Length", transfer.size_bytes);
		// Force download with original filename
		reply.header(
			"Content-Disposition",
			`attachment; filename="${transfer.original_filename}"`,
		);

		// 5. Pipe to client
		await incrementDownloadCount(transfer.id);
		return reply.send(stream);
	} catch (err) {
		fastify.log.error(err);
		return reply.status(500).send({ error: "Storage retrieval failed" });
	}
});

/**
 * Start the server!
 */
const start = async () => {
	try {
		await initializeStorage();

		// Start the background cleanup worker (runs every 5 minutes by default)
		startCleanupWorker();

		await fastify.listen({ port: 3001, host: "0.0.0.0" });
		console.log("Server listening on http://localhost:3001");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();

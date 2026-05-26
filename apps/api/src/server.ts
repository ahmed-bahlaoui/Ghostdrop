import { Transform } from "node:stream";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { z } from "zod";
import { getEnv } from "./config/env.js";
import { startCleanupWorker, stopCleanupWorker } from "./services/cleanup.js";
import redis from "./services/redis.js";
import minio, { BUCKET_NAME, initializeStorage } from "./services/storage.js";
import {
	createTransfer,
	deleteTransfer,
	getTransferByCode,
	markTransferUploaded,
	testPostgres,
	tryIncrementDownloadCount,
} from "./services/transfers.js";
import { generateObjectKey } from "./utils/generate_minio_object_key.js";
import { generateTransferCode } from "./utils/generate_session_transfer_code.js";

const isProd = process.env.NODE_ENV === "production";
const domain = getEnv("DOMAIN");

function getPositiveIntegerEnv(name: string, defaultValue: number): number {
	const rawValue = getEnv(name);
	if (!rawValue) return defaultValue;

	const value = Number(rawValue);
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}

	return value;
}

const MAX_FILE_SIZE_BYTES = getPositiveIntegerEnv(
	"MAX_FILE_SIZE_BYTES",
	1024 * 1024 * 1024,
);
const MAX_DOWNLOADS = getPositiveIntegerEnv("MAX_DOWNLOADS", 10);
const MAX_EXPIRES_IN_MINUTES = getPositiveIntegerEnv(
	"MAX_EXPIRES_IN_MINUTES",
	7 * 24 * 60,
);

const configuredOrigins = (getEnv("CORS_ORIGINS") || "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const allowedOrigins = new Set([
	...configuredOrigins,
	...(domain ? [`https://${domain}`] : []),
	...(isProd
		? []
		: [
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"http://localhost:4173",
			"http://127.0.0.1:4173",
			"http://localhost:3000",
			"http://127.0.0.1:3000"
		]),
]);

const fastify = Fastify({
	logger: isProd
		? true
		: {
			transport: {
				target: "pino-pretty",
				options: {
					translateTime: "HH:MM:ss Z",
					ignore: "pid,hostname",
				},
			},
		},
	trustProxy: true, // Crucial for reading IP from Caddy/X-Forwarded-For
});

// Register CORS
await fastify.register(cors, {
	origin: (origin, callback) => {
		if (!origin || allowedOrigins.has(origin)) {
			callback(null, true);
			return;
		}

		callback(null, false);
	},
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

// Register Rate Limiting (using Redis)
await fastify.register(rateLimit, {
	global: true,
	max: 100, // Default: 100 requests per minute
	timeWindow: "1 minute",
	redis,
	keyGenerator: (request) => {
		return request.ip || "unknown";
	},
});

// Register Multipart for streaming uploads
fastify.register(multipart, {
	limits: {
		fileSize: MAX_FILE_SIZE_BYTES,
	},
});

// Validation Schemas
const CreateTransferSchema = z.object({
	filename: z.string().min(1).max(255),
	size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
	mimeType: z.string().min(1).regex(
		/^[a-z0-9][a-z0-9+.-]*\/[a-z0-9][a-z0-9+.-]*$/i,
		"Invalid MIME type format",
	),
	maxDownloads: z.number().int().positive().max(MAX_DOWNLOADS).optional().default(1),
	expiresInMinutes: z.number().int().positive().max(MAX_EXPIRES_IN_MINUTES).optional().default(60),
	originalSize: z.number().int().positive().max(MAX_FILE_SIZE_BYTES).optional(),
	encryptionAlgorithm: z.enum(["none", "AES-GCM-256"]).optional().default("none"),
	encryptionIv: z.string().min(1).max(128).nullable().optional(),
}).superRefine((value, context) => {
	if (value.encryptionAlgorithm === "none" && value.encryptionIv) {
		context.addIssue({
			code: "custom",
			path: ["encryptionIv"],
			message: "encryptionIv is only allowed for encrypted transfers",
		});
	}
	if (value.encryptionAlgorithm !== "none" && !value.encryptionIv) {
		context.addIssue({
			code: "custom",
			path: ["encryptionIv"],
			message: "encryptionIv is required for encrypted transfers",
		});
	}
});


class UploadSizeMismatchError extends Error {
	constructor(
		readonly expectedSize: number,
		readonly actualSize: number,
	) {
		super(
			`Uploaded file size ${actualSize} does not match expected size ${expectedSize}`,
		);
		this.name = "UploadSizeMismatchError";
	}
}

function sanitizeFilename(filename: string): string {
	return filename
		.replace(/[\\"]/g, "")
		.replace(/[\r\n]/g, " ")
		.trim()
		.slice(0, 255);
}

fastify.get("/", async () => {
	return { name: "GhostDrop API", version: "1.0.0" };
});

fastify.get("/health", async () => {
	try {
		await redis.ping();
		await testPostgres();
		await initializeStorage();

		return { status: "ok", redis: "up", postgres: "up", minIO: "up" };
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
		const { filename, size, originalSize, mimeType, encryptionAlgorithm, encryptionIv, maxDownloads, expiresInMinutes } = parseResult.data;

		const code = generateTransferCode();
		const objectKey = generateObjectKey(filename);
		const expiresAt = new Date();
		expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

		try {
			const transfer = await createTransfer(
				{
					code,
					object_key: objectKey,
					original_filename: filename,
					mime_type: mimeType,
					size_bytes: size,
					max_downloads: maxDownloads,
					expires_at: expiresAt,
					encryption_algorithm: encryptionAlgorithm,
					encryption_iv: encryptionIv ?? null,
					original_size_bytes: originalSize,
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
	},
);

/**
 * Metadata retrieval
 */
fastify.get(
	"/transfers/:code",
	{
		config: {
			rateLimit: {
				max: 10,
				timeWindow: "1 minute",
			},
		},
	},
	async (request, reply) => {
		const { code } = request.params as { code: string };
		const upperCode = code.toUpperCase();

		const transferId: string | null = await redis.get(`transfer:code:${upperCode}`);
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
			originalSize: transfer.original_size_bytes
				? Number(transfer.original_size_bytes)
				: null,
			mimeType: transfer.mime_type,
			expiresAt: transfer.expires_at,
			downloadCount: transfer.download_count,
			maxDownloads: transfer.max_downloads,
			encryption: {
				algorithm: transfer.encryption_algorithm,
				iv: transfer.encryption_iv,
			}
		};
	},
);

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

	// 2. Reject re-uploads to already-uploaded transfers
	if (transfer.status === "uploaded") {
		return reply.status(409).send({ error: "Transfer has already been uploaded" });
	}

	// 3. Get the stream
	const data = await request.file();
	if (!data) {
		return reply.status(400).send({ error: "No file provided" });
	}

	const expectedSize = Number(transfer.size_bytes);
	let actualSize = 0;
	const countedFile = data.file.pipe(
		new Transform({
			transform(chunk: Buffer | string, _encoding, callback) {
				actualSize +=
					typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;

				if (actualSize > expectedSize) {
					callback(new UploadSizeMismatchError(expectedSize, actualSize));
					return;
				}

				callback(null, chunk);
			},
		}),
	);

	try {
		// 3. Pipe to MinIO
		// We use the known size from the metadata handshake for efficiency
		await minio.putObject(
			BUCKET_NAME,
			transfer.object_key,
			countedFile,
			expectedSize,
			{ "Content-Type": transfer.mime_type },
		);

		if (actualSize !== expectedSize) {
			await minio.removeObject(BUCKET_NAME, transfer.object_key);
			return reply.status(400).send({
				error: "Uploaded file size does not match transfer metadata",
				expectedSize,
				actualSize,
			});
		}

		await markTransferUploaded(transfer.id);
		return { message: "Upload successful", code: transfer.code };
	} catch (err) {
		if (err instanceof UploadSizeMismatchError) {
			await minio.removeObject(BUCKET_NAME, transfer.object_key).catch(() => {});
			await deleteTransfer(transfer.id);
			await redis.del(`transfer:code:${upperCode}`);
			return reply.status(400).send({
				error: "Uploaded file size does not match transfer metadata",
				expectedSize: err.expectedSize,
				actualSize: err.actualSize,
			});
		}

		await minio.removeObject(BUCKET_NAME, transfer.object_key).catch(() => {});
		await deleteTransfer(transfer.id);
		await redis.del(`transfer:code:${upperCode}`);
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

	try {
		// 2. Atomically check + increment download count (eliminates TOCTOU race)
		const incremented = await tryIncrementDownloadCount(transfer.id);
		if (!incremented) {
			return reply.status(403).send({ error: "Download limit reached" });
		}

		// 3. Get stream from MinIO
		const stream = await minio.getObject(BUCKET_NAME, transfer.object_key);

		// 4. Set Headers
		reply.header("Content-Type", transfer.mime_type);
		reply.header("Content-Length", transfer.size_bytes);
		// Force download with original filename
		reply.header(
			"Content-Disposition",
			`attachment; filename="${sanitizeFilename(transfer.original_filename)}"`,
		);

		// 5. Pipe to client
		return reply.send(stream);
	} catch (err) {
		fastify.log.error(err);
		return reply.status(500).send({ error: "Storage retrieval failed" });
	}
});

/**
 * Preview endpoint (does NOT increment download count).
 * Used by the peek view for note/image previews without consuming a download slot.
 */
fastify.get("/transfers/:code/preview", async (request, reply) => {
	const { code } = request.params as { code: string };
	const upperCode = code.toUpperCase();

	const transferId = await redis.get(`transfer:code:${upperCode}`);
	if (!transferId) {
		return reply.status(404).send({ error: "Transfer not found or expired" });
	}

	const transfer = await getTransferByCode(upperCode);
	if (!transfer) {
		return reply.status(404).send({ error: "Metadata missing" });
	}

	try {
		const stream = await minio.getObject(BUCKET_NAME, transfer.object_key);

		reply.header("Content-Type", transfer.mime_type);
		reply.header("Content-Length", transfer.size_bytes);
		reply.header(
			"Content-Disposition",
			`inline; filename="${sanitizeFilename(transfer.original_filename)}"`,
		);

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
		console.log("--> Testing redis connection...");
		await redis.ping();
		console.log("--> Redis connection successful!");

		console.log("--> Testing PostgreSQL connection...");
		await testPostgres();
		console.log("--> PostgreSQL connection successful!");

		console.log("--> Initializing MinIO Storage...");
		await initializeStorage();

		// Start the background cleanup worker (runs every 5 minutes by default)
		console.log("--> Starting Cleanup Worker...");
		startCleanupWorker();

		const port = process.env.PORT ? Number(process.env.PORT) : 3100;
		await fastify.listen({ port, host: "0.0.0.0" });
		console.log(`--> Server listening on http://localhost:${port}`);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();

const gracefulShutdown = async (signal: string) => {
	console.log(`Received ${signal}. Starting graceful shutdown...`);
	stopCleanupWorker();
	try {
		await fastify.close();
		console.log("Server closed.");
		process.exit(0);
	} catch (err) {
		console.error("Error during graceful shutdown:", err);
		process.exit(1);
	}
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

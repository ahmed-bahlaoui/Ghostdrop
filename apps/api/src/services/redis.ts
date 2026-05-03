import { Redis } from "ioredis";

const host = process.env.REDIS_HOST || "127.0.0.1";
const port = Number(process.env.REDIS_PORT) || 6380;

console.log(`[ioredis] Connecting to Redis at ${host}:${port}...`);

const redis = new Redis({ host, port });

redis.on("error", (err) => {
	console.error("[ioredis] Error connecting to Redis:", err);
});

export default redis;

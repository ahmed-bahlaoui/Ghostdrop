import { Redis } from "ioredis";
import { getEnv } from "../config/env.js";

const host = getEnv("REDIS_HOST") || "127.0.0.1";
const port = Number(getEnv("REDIS_PORT")) || 6380;
const password = getEnv("REDIS_PASSWORD");

console.log(`[ioredis] Connecting to Redis at ${host}:${port}...`);

const redis = new Redis({ host, port, password });

redis.on("error", (err) => {
	console.error("[ioredis] Error connecting to Redis:", err);
});

export default redis;

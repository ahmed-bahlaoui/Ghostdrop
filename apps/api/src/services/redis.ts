import { Redis } from "ioredis";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// loading environment variables from .env file if it exists in the grandparent directory of this file
export const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");

if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
}


const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6380,
});

async function testConnection() {
    await redis.ping(); // throws if unreachable
    console.log("Redis is up");

    await redis.set("hello", "world", "EX", 60); // expires in 60s
    const value = await redis.get("hello");
    console.log("Got:", value); // "world"

    await redis.disconnect();
}

testConnection();



import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The .env is in the root of the api app: apps/api/.env
// This file is in apps/api/src/config/env.ts
// So we go up two levels: ../../.env
export const envPath = resolve(__dirname, "../../.env");

if (existsSync(envPath)) {
	console.log(`[Config] Loading environment from ${envPath}`);
	process.loadEnvFile(envPath);
} else {
	console.warn(`[Config] .env file not found at ${envPath}`);
}

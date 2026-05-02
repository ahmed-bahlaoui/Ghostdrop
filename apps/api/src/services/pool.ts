import { Pool } from "pg";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";


// loading environment variables from .env file if it exists in the grandparent directory of this file
export const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");

if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
}

function requireEnv(name: string) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

const pool = new Pool({
    host: requireEnv("POSTGRES_HOST"),
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: requireEnv("POSTGRES_USER"),
    password: requireEnv("POSTGRES_PASSWORD"),
    database: requireEnv("POSTGRES_DB"),
});

export default pool;

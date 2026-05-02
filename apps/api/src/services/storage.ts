import { Client } from "minio";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const minio = new Client({
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: Number(process.env.MINIO_PORT) || 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

export default minio;
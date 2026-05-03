import { Pool } from "pg";

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

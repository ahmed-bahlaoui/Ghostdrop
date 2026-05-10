import { Pool } from "pg";
import { getEnv, requireEnv } from "../config/env.js";

const pool = new Pool({
	host: requireEnv("POSTGRES_HOST"),
	port: Number(getEnv("POSTGRES_PORT")) || 5432,
	user: requireEnv("POSTGRES_USER"),
	password: requireEnv("POSTGRES_PASSWORD"),
	database: requireEnv("POSTGRES_DB"),
});

export default pool;

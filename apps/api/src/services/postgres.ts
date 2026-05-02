import pool from "./pool.ts";


async function testConnection() {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT NOW()");
        console.log("Connected to PostgreSQL at:", result.rows[0].now);
    } finally {
        client.release(); // always release back to the pool
    }
}

testConnection();
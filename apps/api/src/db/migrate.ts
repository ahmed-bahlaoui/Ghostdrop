import pool from "../services/pool.ts";

async function connect() {
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("Connected successfully:", result.rows[0]);
    } catch (err) {
        console.error("Database connection error:", err);
    } finally {
        await pool.end(); // closes pool
    }
}


async function migrate() {
    // connect to database  get credentials from environment variables
    await connect();

    
    // ensure migrations table exists, if not create it


    // load migration files located in /migrations from the current directory

    // determine pending migrations

    // execute them in transaction, rollback if any migration fails

    // record successful migrations
}

migrate();
// backend/src/db/pool.js
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
  max:              10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres client error", err);
});

/**
 * Execute a parameterised query.
 * @param {string} text - SQL with $1, $2 placeholders
 * @param {any[]}  params
 */
async function query(text, params) {
  const start = Date.now();
  const res   = await pool.query(text, params);
  const dur   = Date.now() - start;
  if (process.env.NODE_ENV === "development") {
    console.log(`[DB] ${dur}ms — ${text.slice(0, 80)}`);
  }
  return res;
}

module.exports = { query, pool };

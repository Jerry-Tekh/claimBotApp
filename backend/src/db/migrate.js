// backend/src/db/migrate.js
// Run: node src/db/migrate.js
require("dotenv").config();
const { pool } = require("./pool");
const fs       = require("fs");
const path     = require("path");

async function migrate() {
  const schemaPath = path.join(__dirname, "../../schema.sql");
  const sql        = fs.readFileSync(schemaPath, "utf8");

  console.log("Running ClaimBot DB migrations...");
  try {
    await pool.query(sql);
    console.log("✅ Migrations applied successfully.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();

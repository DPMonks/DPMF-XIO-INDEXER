import { pool } from "./db.js";

export async function ensureXioCompatViews() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_holders_latest (
        id SERIAL PRIMARY KEY,
        account TEXT,
        balance NUMERIC,
        frozen BOOLEAN DEFAULT FALSE,
        closed BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'active',
        updated_at TIMESTAMP DEFAULT NOW(),
        download_link TEXT
      );
    `);
    await pool.query(`
      CREATE OR REPLACE VIEW xio_holders AS
      SELECT account, balance, frozen, closed, status, updated_at
      FROM token_holders_latest;
    `);
    console.log("[DB] xio_holders view ready (token_holders_latest)");
  } catch (err) {
    console.error("[DB] xio_holders view failed", err?.message || err);
  }
}

ensureXioCompatViews();

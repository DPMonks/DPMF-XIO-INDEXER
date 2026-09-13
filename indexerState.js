// indexerState.js (root-level)

import { pool } from "./db.js";

// -----------------------------
// GENERIC GET/SET STATE
// -----------------------------
export async function getState(key) {
  const result = await pool.query(
    `SELECT value FROM indexer_state WHERE key = $1 LIMIT 1`,
    [key]
  );
  return result.rows[0]?.value || null;
}

export async function setState(key, value) {
  await pool.query(
    `INSERT INTO indexer_state (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

// -----------------------------
// WORKER MARKER HELPERS
// -----------------------------
export async function saveMarker(workerId, marker) {
  return setState(`holders_marker_worker_${workerId}`, marker);
}

export async function loadMarker(workerId) {
  return getState(`holders_marker_worker_${workerId}`);
}

// -----------------------------
// LAST SCAN TIMESTAMP HELPERS
// -----------------------------
export async function saveLastScan(workerId) {
  await pool.query(
    `INSERT INTO indexer_state (key, value)
     VALUES ($1, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = NOW()`,
    [`holders_last_scan_worker_${workerId}`]
  );
}

export async function loadLastScan(workerId) {
  const result = await pool.query(
    `SELECT value FROM indexer_state WHERE key = $1 LIMIT 1`,
    [`holders_last_scan_worker_${workerId}`]
  );
  return result.rows[0]?.value || null;
}


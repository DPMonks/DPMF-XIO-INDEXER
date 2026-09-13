// src/indexer/ownershipScanner.js

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { pool } from "../../db.js";
import { setState } from "../../indexerState.js";

export async function runOwnershipScanner() {
  console.log("[OWNERSHIP_SCANNER] Building final XIO holder snapshot…");

  const { rows: holders } = await pool.query(`
    SELECT account, balance, status
    FROM token_holders_latest
  `);

  if (!holders.length) {
    console.log("[OWNERSHIP_SCANNER] No holders found. Skipping metrics.");
    return;
  }

  const sorted = holders.sort(
    (a, b) => parseFloat(b.balance) - parseFloat(a.balance)
  );

  const totalHolders = sorted.length;
  const activeHolders = sorted.filter((h) => h.status === "active").length;
  const zeroBalance = sorted.filter((h) => h.status === "zero_balance").length;
  const removed = sorted.filter((h) => h.status === "removed").length;
  const frozen = sorted.filter((h) => h.status === "frozen").length;

  const totalSupply = sorted.reduce(
    (acc, h) => acc + parseFloat(h.balance || 0),
    0
  );

  await pool.query(
    `
    INSERT INTO token_metrics_latest (
      total_holders,
      active_holders,
      zero_balance_holders,
      removed_holders,
      frozen_holders,
      total_supply,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      total_holders = EXCLUDED.total_holders,
      active_holders = EXCLUDED.active_holders,
      zero_balance_holders = EXCLUDED.zero_balance_holders,
      removed_holders = EXCLUDED.removed_holders,
      frozen_holders = EXCLUDED.frozen_holders,
      total_supply = EXCLUDED.total_supply,
      updated_at = NOW();
    `,
    [
      totalHolders,
      activeHolders,
      zeroBalance,
      removed,
      frozen,
      totalSupply
    ]
  );

  await pool.query(
    `
    INSERT INTO token_metrics (
      total_holders,
      active_holders,
      zero_balance_holders,
      removed_holders,
      frozen_holders,
      total_supply,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW());
    `,
    [
      totalHolders,
      activeHolders,
      zeroBalance,
      removed,
      frozen,
      totalSupply
    ]
  );

  await setState("last_run", new Date().toISOString());
  await setState("total_holders", totalHolders.toString());
  await setState("total_supply", totalSupply.toString());

  console.log("[OWNERSHIP_SCANNER] Snapshot + metrics updated successfully.");
}


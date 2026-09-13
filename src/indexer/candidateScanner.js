// src/indexer/candidateScanner.js

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { pool } from "../../db.js";
import { getWsClient } from "../../xrplClient.js";

const ISSUER = process.env.XIO_ISSUER;
const XIO_CURRENCY = process.env.XIO_CURRENCY || "XIO";

export async function runCandidateScanner() {
  console.log("[CANDIDATE_SCANNER] Starting candidate trustline verification…");

  const client = await getWsClient();

  const { rows: candidates } = await pool.query(`
    SELECT account FROM issuer_candidates
  `);

  console.log(`[CANDIDATE_SCANNER] Loaded ${candidates.length} candidate accounts`);

  let processed = 0;

  for (const row of candidates) {
    const account = row.account;

    try {
      const res = await client.request({
        command: "account_lines",
        account
      });

      const lines = res.result.lines || [];

      const xio = lines.find(
        (l) => l.currency === XIO_CURRENCY && l.account === ISSUER
      );

      if (!xio) {
        await writeHolderState(account, 0, "removed");
      } else {
        const balance = parseFloat(xio.balance || "0");
        const limit = parseFloat(xio.limit || "0");
        const flags = xio.flags || 0;

        let status = "active";

        if (balance === 0 && limit > 0) status = "zero_balance";
        if (limit === 0) status = "closed";
        if (flags & 0x00100000) status = "frozen";

        await writeHolderState(account, balance, status);
      }

      processed++;

      if (processed % 500 === 0) {
        console.log(
          `[CANDIDATE_SCANNER] Processed ${processed}/${candidates.length}`
        );
      }
    } catch (err) {
      console.error("[CANDIDATE_SCANNER] Error scanning", account, err.message);
    }
  }

  console.log("[CANDIDATE_SCANNER] Completed candidate trustline verification");
}

async function writeHolderState(account, balance, status) {
  await pool.query(
    `
    INSERT INTO token_holders_latest (account, balance, status, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (account)
    DO UPDATE SET
      balance = EXCLUDED.balance,
      status = EXCLUDED.status,
      updated_at = NOW();
    `,
    [account, balance, status]
  );

  await pool.query(
    `
    INSERT INTO token_holders_history (account, balance, status, updated_at)
    VALUES ($1, $2, $3, NOW());
    `,
    [account, balance, status]
  );
}

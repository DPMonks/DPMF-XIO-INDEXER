// src/indexer/issuerWalker.js

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getFullHistoryClient } from "../../xrplClient.js";
import { pool } from "../../db.js";

const ISSUER_ADDRESS = process.env.XIO_ISSUER;
const FIRST_XIO_LEDGER = 67240810;

const RELEVANT_TX_TYPES = new Set([
  "TrustSet",
  "Payment",
  "OfferCreate",
  "OfferCancel",
  "AMMDeposit",
  "AMMWithdraw",
  "AMMCreate",
  "AMMDelete"
]);

export async function runIssuerWalker() {
  const client = await getFullHistoryClient();

  let processed = 0;

  console.log("[ISSUER_WALKER] Starting issuer transaction scan for", ISSUER_ADDRESS);

  try {
    const res = await client.request({
      command: "account_tx",
      account: ISSUER_ADDRESS,
      ledger_index_min: FIRST_XIO_LEDGER,
      ledger_index_max: -1,
      limit: 200
    });

    const txs = res.result.transactions || [];

    for (const tx of txs) {
      const { tx: inner, meta } = tx;
      const type = inner.TransactionType;
      const ledgerIndex = tx.ledger_index;

      if (!RELEVANT_TX_TYPES.has(type)) continue;

      const involvedAccounts = extractInvolvedAccounts(inner, meta);

      for (const account of involvedAccounts) {
        await upsertIssuerCandidate(account, ledgerIndex, type);
      }

      processed++;
    }
  } catch (err) {
    console.error("[ISSUER_WALKER] account_tx failed:", err);
  }

  console.log("[ISSUER_WALKER] Completed issuer scan. Processed TX:", processed);
}

function extractInvolvedAccounts(tx, meta) {
  const accounts = new Set();

  if (tx.Account) accounts.add(tx.Account);

  if (tx.TransactionType === "Payment" && tx.Destination) {
    accounts.add(tx.Destination);
  }

  if (tx.TransactionType === "OfferCreate" && tx.Account) {
    accounts.add(tx.Account);
  }

  return Array.from(accounts).filter((a) => a !== ISSUER_ADDRESS);
}

async function upsertIssuerCandidate(account, ledgerIndex, source) {
  await pool.query(
    `
    INSERT INTO issuer_candidates (account, first_seen_ledger, last_seen_ledger, last_seen, source)
    VALUES ($1, $2, $2, NOW(), $3)
    ON CONFLICT (account)
    DO UPDATE SET
      last_seen_ledger = EXCLUDED.last_seen_ledger,
      last_seen = EXCLUDED.last_seen,
      source = EXCLUDED.source;
    `,
    [account, ledgerIndex, source]
  );
}


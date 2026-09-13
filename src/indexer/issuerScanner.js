// /src/indexer/issuerScanner.js
// CLIO‑COMPATIBLE ISSUER SCANNER (no ledger walking)

import { rpcRequestFull } from "../../xrplClient.js";
import { pool } from "../../db.js";
import { logger } from "../../utils/logger.js";

const XIO_ISSUER = process.env.XIO_ISSUER;
const XIO_CURRENCY = process.env.XIO_CURRENCY || "XIO";

function extractXioAccounts(tx) {
  const accounts = new Set();

  try {
    const meta = tx.meta || {};
    const txn = tx.tx || {};

    if (txn.Account) accounts.add(txn.Account);
    if (txn.Destination) accounts.add(txn.Destination);

    if (txn.TransactionType === "TrustSet" && txn.LimitAmount) {
      if (
        txn.LimitAmount.issuer === XIO_ISSUER &&
        txn.LimitAmount.currency === XIO_CURRENCY
      ) {
        accounts.add(txn.Account);
      }
    }

    if (txn.TransactionType === "Payment") {
      const amt = txn.Amount;
      if (
        amt &&
        typeof amt === "object" &&
        amt.issuer === XIO_ISSUER &&
        amt.currency === XIO_CURRENCY
      ) {
        accounts.add(txn.Account);
        accounts.add(txn.Destination);
      }
    }

    if (txn.TransactionType === "OfferCreate" || txn.TransactionType === "OfferCancel") {
      const pays = txn.TakerPays;
      const gets = txn.TakerGets;

      if (
        pays &&
        typeof pays === "object" &&
        pays.issuer === XIO_ISSUER &&
        pays.currency === XIO_CURRENCY
      ) {
        accounts.add(txn.Account);
      }

      if (
        gets &&
        typeof gets === "object" &&
        gets.issuer === XIO_ISSUER &&
        gets.currency === XIO_CURRENCY
      ) {
        accounts.add(txn.Account);
      }
    }

    if (txn.TransactionType?.startsWith("AMM")) {
      accounts.add(txn.Account);
    }

    if (txn.TransactionType === "AMMDeposit" || txn.TransactionType === "AMMWithdraw") {
      accounts.add(txn.Account);
    }

    if (meta.AffectedNodes) {
      for (const node of meta.AffectedNodes) {
        const entry = node.ModifiedNode || node.CreatedNode || node.DeletedNode;
        if (!entry) continue;

        const fields = entry.FinalFields || entry.NewFields || entry.PreviousFields;
        if (!fields) continue;

        if (fields.Account) accounts.add(fields.Account);
        if (fields.Owner) accounts.add(fields.Owner);
      }
    }
  } catch (err) {
    logger.error("ISSUER", "Failed to extract XIO accounts", err);
  }

  return accounts;
}

async function saveIssuerAccounts(accounts) {
  if (!accounts || accounts.size === 0) return;

  const arr = [...accounts];

  for (const acc of arr) {
    await pool.query(
      `
      INSERT INTO xio_accounts (account)
      VALUES ($1)
      ON CONFLICT (account) DO NOTHING
      `,
      [acc]
    );
  }

  logger.info("ISSUER", `Saved ${arr.length} XIO-linked accounts`);
}

export async function runIssuerScanner() {
  logger.info("ISSUER", "Starting CLIO‑compatible XIO issuer scan");

  const allAccounts = new Set();
  let marker = null;

  while (true) {
    const json = await rpcRequestFull({
      method: "account_tx",
      params: [
        {
          account: XIO_ISSUER,
          ledger_index_min: -1,
          ledger_index_max: -1,
          limit: 2000,
          marker,
          forward: false
        }
      ]
    });

    const txs = json?.result?.transactions || [];
    if (txs.length === 0) break;

    for (const tx of txs) {
      const extracted = extractXioAccounts(tx);
      extracted.forEach((a) => allAccounts.add(a));
    }

    if (!json?.result?.marker) break;
    marker = json.result.marker;
  }

  await saveIssuerAccounts(allAccounts);

  logger.info(
    "ISSUER",
    `CLIO issuer scan complete — ${allAccounts.size} XIO accounts discovered`
  );
}

// src/indexer/trustlineScanner.js
// Issuer account_lines — do NOT walk the whole ledger (rate-limit + 0-holder bug).

import { fetchAccountLines } from "../../xrplClient.js";
import { logger } from "../../utils/logger.js";
import { writeTokenHolders, writeTokenHoldersHistory } from "../../dbWriter.js";

const XIO_ISSUER = process.env.XIO_ISSUER || "rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU";
const XIO_CURRENCY_HEX = (
  process.env.XIO_CURRENCY_HEX || "58494F0000000000000000000000000000000000"
).toUpperCase();

function isXioCurrency(code) {
  const raw = String(code || "");
  const up = raw.toUpperCase();
  if (up === "XIO") return true;
  if (up === XIO_CURRENCY_HEX) return true;
  if (up.replace(/0+$/, "") === "58494F") return true;
  return false;
}

export async function runTrustlineScanner() {
  logger.info("HOLDERS", "XIO trustline scan via issuer account_lines");

  const lines = await fetchAccountLines(XIO_ISSUER);
  const holderMap = new Map();

  for (const line of lines || []) {
    if (!isXioCurrency(line.currency)) continue;
    const account = line.account;
    if (!account || account === XIO_ISSUER) continue;
    const balance = Math.abs(Number(line.balance) || 0);
    holderMap.set(account, {
      account,
      balance,
      frozen: Boolean(line.freeze || line.frozen),
      closed: false,
      status: balance > 0 ? "active" : "empty",
    });
  }

  const holderArray = [...holderMap.values()];
  const withBal = holderArray.filter((h) => h.balance > 0).length;
  logger.info("HOLDERS", `Extracted ${holderArray.length} XIO trustlines (${withBal} holders)`);

  await writeTokenHolders(holderArray);
  await writeTokenHoldersHistory(holderArray);
  logger.info("HOLDERS", "XIO trustline scan completed");
}

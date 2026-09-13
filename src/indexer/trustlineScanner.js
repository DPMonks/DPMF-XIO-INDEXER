// src/indexer/trustlineScanner.js — DIAGNOSTIC‑ENABLED

import { rpcRequestFull } from "../../xrplClient.js";
import { logger } from "../../utils/logger.js";
import { writeTokenHolders } from "../../dbWriter.js";

const XIO_ISSUER = process.env.XIO_ISSUER;
const XIO_CURRENCY_HEX = process.env.XIO_CURRENCY_HEX;

async function fetchRippleStates(marker = null) {
  const req = {
    method: "ledger_data",
    params: [
      {
        ledger_index: "validated",
        type: "state",
        limit: 2048,
        marker
      }
    ]
  };

  const json = await rpcRequestFull(req);
  return json?.result || {};
}

function extractXioTrustlines(stateObjects) {
  const holders = [];

  for (const obj of stateObjects) {
    if (obj.LedgerEntryType !== "RippleState") continue;

    const low = obj.LowLimit;
    const high = obj.HighLimit;

    // 🔍 DEBUG: log ANY RippleState involving the issuer
    if (low.issuer === XIO_ISSUER || high.issuer === XIO_ISSUER) {
      logger.info("DEBUG_XIO_RIPPLESTATE", {
        lowCurrency: low.currency,
        highCurrency: high.currency,
        lowIssuer: low.issuer,
        highIssuer: high.issuer,
        balance: obj.Balance?.value
      });
    }

    const isLow =
      low.issuer === XIO_ISSUER &&
      low.currency === XIO_CURRENCY_HEX;

    const isHigh =
      high.issuer === XIO_ISSUER &&
      high.currency === XIO_CURRENCY_HEX;

    if (!isLow && !isHigh) continue;

    const holder = isLow ? high.account : low.account;
    const balance = Number(obj.Balance?.value || 0);

    if (balance <= 0) continue;

    holders.push({ account: holder, balance });
  }

  return holders;
}

export async function runTrustlineScanner() {
  logger.info("HOLDERS", ">>> XRPL-CORRECT TRUSTLINE SCANNER ACTIVE (HEX + ISSUER) <<<");

  let marker = null;
  const holderMap = new Map();

  do {
    const result = await fetchRippleStates(marker);
    const objects = result.state || [];
    const holders = extractXioTrustlines(objects);

    for (const h of holders) {
      holderMap.set(h.account, h.balance);
    }

    marker = result.marker || null;
  } while (marker);

  logger.info("HOLDERS", `Extracted ${holderMap.size} unique XIO holders`);

  const holderArray = Array.from(holderMap, ([account, balance]) => ({
    account,
    balance
  }));

  await writeTokenHolders(holderArray);

  logger.info("HOLDERS", "XIO trustline scan completed");
}


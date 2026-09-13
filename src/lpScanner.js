// src/lpScanner.js — FULLY FIXED

import { fetchAccountLines } from "../xrplClient.js";
import { loadDynamicXioPools } from "./indexer/pools.js";
import staticPools from "./indexer/pools.js";
import { writeLpHolders, writeLpHoldersHistory } from "../dbWriter.js";
import { logger } from "../utils/logger.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const XIO_ISSUER = process.env.XIO_ISSUER;
const XIO_CURRENCY_HEX = process.env.XIO_CURRENCY_HEX;

const RLUSD_ISSUER = process.env.RLUSD_ISSUER;
const RLUSD_LP_HEX = process.env.RLUSD_LP_HEX;

async function scanLpPool(poolDef) {
  try {
    // Inject XIO LP HEX + issuer
    if (!poolDef.lp_currency_hex && poolDef.tokenA.currency === "XIO") {
      poolDef.lp_currency_hex = XIO_CURRENCY_HEX;
    }
    if (!poolDef.lp_issuer && poolDef.tokenA.currency === "XIO") {
      poolDef.lp_issuer = XIO_ISSUER;
    }

    // Inject RLUSD LP HEX + issuer
    if (!poolDef.lp_currency_hex && poolDef.tokenB.currency === "RLUSD") {
      poolDef.lp_currency_hex = RLUSD_LP_HEX;
    }
    if (!poolDef.lp_issuer && poolDef.tokenB.currency === "RLUSD") {
      poolDef.lp_issuer = RLUSD_ISSUER;
    }

    const lpHex = poolDef.lp_currency_hex;
    const issuer = poolDef.lp_issuer;

    if (!lpHex || !issuer) {
      logger.warn("LP", `Pool ${poolDef.name} missing LP hex or issuer`);
      return [];
    }

    const lines = await fetchAccountLines(issuer);
    const holders = [];

    for (const line of lines) {
      if (line.currency !== lpHex) continue;

      const account = line.account;
      const balance = Math.abs(Number(line.balance)) || 0;
      if (balance <= 0) continue;

      holders.push({
        account,
        balance,
        lp_currency_hex: lpHex,
        lp_issuer: issuer,
        trustline_raw: line,
        download_link: `/api/trustline/${issuer}/${lpHex}/${account}`
      });
    }

    await writeLpHolders(poolDef.name, holders);
    await writeLpHoldersHistory(poolDef.name, holders);

    logger.info("LP", `LP scan complete for ${poolDef.name} (${holders.length} holders)`);

    return holders;
  } catch (err) {
    logger.error("LP", `Failed LP scan for ${poolDef.name}`, err);
    return [];
  }
}

export async function runLpScanner() {
  logger.info("LP", "Starting LP scanner");

  const dynamicList = await loadDynamicXioPools();
  const allPools = [...staticPools, ...dynamicList];

  for (const poolDef of allPools) {
    await scanLpPool(poolDef);
    await sleep(500);
  }

  logger.info("LP", "All LP pools scanned successfully");
}

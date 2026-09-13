// src/lpScanner.js — LP token issuer is the AMM account, not the XIO issuer.

import { fetchAccountLines } from "../xrplClient.js";
import { loadDynamicXioPools } from "./indexer/pools.js";
import staticPools from "./indexer/pools.js";
import { writeLpHolders, writeLpHoldersHistory } from "../dbWriter.js";
import { logger } from "../utils/logger.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const XIO_ISSUER = process.env.XIO_ISSUER || "rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU";

const DEFAULT_LP = {
  "XRP/XIO": {
    hex: process.env.LP_CURRENCY_HEX || "030AE7B410D0ECF1DEC886D216866C31C898C875",
    amm: process.env.AMM_ACCOUNT || "rPYfrbCvJGGEs9ddUtRiq58kCJBw9hoGij",
  },
  "XIO/XRP": {
    hex: process.env.LP_CURRENCY_HEX || "030AE7B410D0ECF1DEC886D216866C31C898C875",
    amm: process.env.AMM_ACCOUNT || "rPYfrbCvJGGEs9ddUtRiq58kCJBw9hoGij",
  },
  "XIO/XDX": {
    hex: process.env.XIO_XDX_LP_HEX || "03E7A465A6E95CDA21E1110056AA51A71FA55CB9",
    amm: process.env.XIO_XDX_AMM_ACCOUNT || "rDJXzsZGACeHGJQYfaudsYshaC5zJxqsHr",
  },
  "XDX/XIO": {
    hex: process.env.XIO_XDX_LP_HEX || "03E7A465A6E95CDA21E1110056AA51A71FA55CB9",
    amm: process.env.XIO_XDX_AMM_ACCOUNT || "rDJXzsZGACeHGJQYfaudsYshaC5zJxqsHr",
  },
};

function sameCurrency(left, right) {
  return String(left || "").toUpperCase() === String(right || "").toUpperCase();
}

async function scanLpPool(poolDef) {
  try {
    const defaults = DEFAULT_LP[poolDef.name] || {};
    const amm = poolDef.amm_issuer || defaults.amm;
    let lpHex = poolDef.lp_currency_hex || defaults.hex;
    let issuer = poolDef.lp_issuer || defaults.amm || amm;

    // Env sometimes copies the XIO issuer into LP_ISSUER — that is never the LP token issuer.
    if (!issuer || issuer === XIO_ISSUER) issuer = amm;
    if (lpHex && sameCurrency(lpHex, process.env.XIO_CURRENCY_HEX) && defaults.hex) {
      lpHex = defaults.hex;
    }

    if (!lpHex || !issuer) {
      logger.warn("LP", `Pool ${poolDef.name} missing LP hex or AMM issuer — skip`);
      return [];
    }

    const lines = await fetchAccountLines(issuer);
    const holders = [];

    for (const line of lines || []) {
      if (!sameCurrency(line.currency, lpHex)) continue;
      const account = line.account;
      if (!account || account === issuer) continue;
      const balance = Math.abs(Number(line.balance) || 0);
      if (balance <= 0) continue;
      holders.push({
        account,
        balance,
        lp_currency_hex: lpHex,
        lp_issuer: issuer,
        download_link: `/api/trustline/${issuer}/${lpHex}/${account}`,
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
  const dynamicList = await loadDynamicXioPools().catch(() => []);
  const byName = new Map();
  for (const poolDef of [...staticPools, ...dynamicList]) {
    if (poolDef?.name) byName.set(poolDef.name, poolDef);
  }

  for (const poolDef of byName.values()) {
    await scanLpPool(poolDef);
    await sleep(500);
  }
  logger.info("LP", "All LP pools scanned successfully");
}

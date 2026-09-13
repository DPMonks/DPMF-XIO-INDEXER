// src/ammScannerXio.js — FIXED

import { fetchAmmInfo } from "../xrplClient.js";
import { loadDynamicXioPools } from "./indexer/pools.js";
import staticPools from "./indexer/pools.js";
import { pool } from "../db.js";
import { logger } from "../utils/logger.js";
import { parseAmount, xrplAsset } from "./pairAssets.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scanSinglePool(poolDef) {
  try {
    const { tokenA, tokenB } = poolDef;

    const amm = await fetchAmmInfo(xrplAsset(tokenA), xrplAsset(tokenB));
    if (!amm) {
      logger.warn("AMM", `No AMM data for pool ${poolDef.name}`);
      return null;
    }

    const amountA = parseAmount(amm.amount);
    const amountB = parseAmount(amm.amount2);
    const price = amountA > 0 ? amountB / amountA : 0;
    const lpSupply = Number(amm.lp_token?.value || 0);

    return {
      name: poolDef.name,
      tokenA,
      tokenB,
      amountA,
      amountB,
      price,
      lpSupply,
      assets_in_pool: 2,
      usdValue: null
    };
  } catch (err) {
    logger.error("AMM", `Failed to scan pool ${poolDef.name}`, err);
    return null;
  }
}

export async function runAmmScannerXio() {
  logger.info("AMM", "Starting XIO AMM scan");

  const dynamicPools = await loadDynamicXioPools();
  // loadDynamicXioPools already includes staticPools — dedupe by name
  const byName = new Map();
  for (const p of [...staticPools, ...dynamicPools]) {
    if (p?.name) byName.set(p.name, p);
  }
  const allPools = [...byName.values()];
  const results = [];

  for (const poolDef of allPools) {
    const r = await scanSinglePool(poolDef);
    if (r) results.push(r);
    await sleep(500);
  }

  if (results.length === 0) {
    logger.warn("AMM", "No AMM pools returned data");
    return;
  }

  for (const r of results) {
    await pool.query(
      `
      INSERT INTO amm_pool_snapshots
      (timestamp, pool_name, amountA, amountB, price, lp_supply, assets_in_pool, usd_value)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)
      `,
      [
        r.name,
        r.amountA,
        r.amountB,
        r.price,
        r.lpSupply,
        r.assets_in_pool,
        r.usdValue
      ]
    );
  }

  logger.info("AMM", `AMM scan complete (${results.length} pools)`);
}

// /src/indexer/indexer.js
// Single-service TEST: run scanners here (WORKER_ROLE=api is fine).
// Stagger 90s * WORKER_ID so extra workers can be added later without colliding.

import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from "dotenv";
dotenv.config();

const workerId = Number(process.env.WORKER_ID || 1);
const totalWorkers = Number(process.env.TOTAL_WORKERS || 1);
const workerRole = String(process.env.WORKER_ROLE || "api").toLowerCase();

const startupDelay = workerId * 90000;
const baseWarmupDelay = 8000;
const extraWarmupForHeavyWorker = 20000;
const warmupDelay = baseWarmupDelay + extraWarmupForHeavyWorker;

console.log(
  `Worker ${workerId}/${totalWorkers} role=${workerRole} scheduled (delay ${(startupDelay + warmupDelay) / 1000}s) — API can boot immediately`
);

import staticPools from "./pools.js";
import { logger } from "../../utils/logger.js";
import { updateHealthTimestamp } from "../../health.js";
import { pool } from "../../db.js";
import { writeTokenMetrics, writeActivityHistory } from "../../dbWriter.js";
import { wsReady, fullReady } from "../../xrplClient.js";
import { runTrustlineScanner } from "./trustlineScanner.js";
import { runAmmScannerXio } from "../ammScannerXio.js";
import { runLpScanner } from "../lpScanner.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const METRICS_INTERVAL_MS = 60 * 1000;
const XIO_TOTAL_SUPPLY = 10_000;
let lastMetricsRun = 0;

async function backfillActivityFromInftf() {
  try {
    const countRes = await pool.query("SELECT COUNT(*)::int AS n FROM token_activity_history");
    if ((countRes.rows[0]?.n || 0) >= 10) return;
    const issuer = process.env.XIO_ISSUER || "rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU";
    const url = `https://xrpldata.inftf.org/v1/iou/market_data/${issuer}_XIO/XRP?interval=1d&start=2021-10-24T00:00:00Z&limit=1000`;
    const rows = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "DPMF-XIO-Indexer" },
      signal: AbortSignal.timeout(30_000),
    }).then((r) => r.json()).catch(() => []);
    if (!Array.isArray(rows) || !rows.length) return;
    let inserted = 0;
    for (const row of rows) {
      const close = Number(row.close);
      const ts = row.timestamp;
      if (!(close > 0) || !ts) continue;
      await pool.query(
        `INSERT INTO token_activity_history (timestamp, price, volume, marketcap, rank, traders, holders)
         VALUES ($1, $2, $3, $4, 0, 0, 0)`,
        [ts, close, Number(row.base_volume) || 0, close * 9983]
      );
      inserted += 1;
    }
    logger.info("SYSTEM", `Backfilled ${inserted} InFTF daily XIO/XRP prints into token_activity_history`);
  } catch (err) {
    logger.warn("SYSTEM", `Activity backfill skipped: ${err?.message || err}`);
  }
}

async function startIndexer() {
  console.log(`Worker ${workerId} starting in ${(startupDelay + warmupDelay) / 1000}s…`);
  await new Promise((r) => setTimeout(r, startupDelay + warmupDelay));
  console.log("ENV CHECK:", {
    XIO_ISSUER: process.env.XIO_ISSUER,
    AMM_ACCOUNT: process.env.AMM_ACCOUNT,
    LP_ISSUER: process.env.LP_ISSUER,
    LP_CURRENCY_HEX: process.env.LP_CURRENCY_HEX,
    WORKER_ID: process.env.WORKER_ID,
    WORKER_ROLE: process.env.WORKER_ROLE,
    TOTAL_WORKERS: process.env.TOTAL_WORKERS,
  });
  logger.info("SYSTEM", "Waiting for XRPL clients to be ready…");
  await wsReady;
  await fullReady;
  logger.info("SYSTEM", "XRPL clients ready — starting holder/AMM/LP/metrics loop");
  await backfillActivityFromInftf();

  while (true) {
    logger.cycle("Starting new indexer cycle");
    updateHealthTimestamp();
    const cycleStart = Date.now();

    try {
      logger.info("HOLDERS", "Running XIO trustline scan (account_lines)…");
      await runTrustlineScanner();
      logger.info("HOLDERS", "XIO trustline scan completed");
    } catch (err) {
      logger.error("HOLDERS", "Trustline scanner crashed", err);
    }

    try {
      logger.info("AMM", "Running XIO AMM scan (all pools)…");
      await runAmmScannerXio();
      logger.info("AMM", "XIO AMM scan completed");
    } catch (err) {
      logger.error("AMM", "XIO AMM scan crashed", err);
    }

    try {
      logger.info("LP", "Running XIO LP scan (all pools)…");
      await runLpScanner();
      logger.info("LP", "XIO LP scan completed");
    } catch (err) {
      logger.error("LP", "XIO LP scan crashed", err);
    }

    try {
      const now = Date.now();
      if (now - lastMetricsRun >= METRICS_INTERVAL_MS) {
        const poolNames = [...new Set(staticPools.map((p) => p.name).filter(Boolean)), "XRP/XIO", "XIO/XRP"];
        const ammRes = await pool.query(
          `SELECT price, pool_name FROM amm_pool_snapshots
           WHERE pool_name = ANY($1)
           ORDER BY timestamp DESC LIMIT 1`,
          [poolNames]
        );
        const price = Number(ammRes.rows[0]?.price || 0);

        const holderResult = await pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0) AS holders,
            COUNT(*) AS trustlines,
            COALESCE(SUM(balance) FILTER (WHERE COALESCE(balance, 0) > 0), 0) AS circ
          FROM token_holders_latest
        `);
        const holders = Number(holderResult.rows[0]?.holders || 0);
        const trustlines = Number(holderResult.rows[0]?.trustlines || 0);
        const circulating = Number(holderResult.rows[0]?.circ || 0);
        const marketCap = price * circulating;
        const fdv = price * XIO_TOTAL_SUPPLY;

        await writeTokenMetrics({
          marketCap,
          fdv,
          circulating,
          totalSupply: XIO_TOTAL_SUPPLY,
          holders,
          trustlines,
        });
        await writeActivityHistory({
          price,
          volume: 0,
          marketcap: marketCap,
          rank: 0,
          traders: holders,
          holders,
        });
        lastMetricsRun = now;
        logger.info("SYSTEM", `Metrics/activity updated holders=${holders} trustlines=${trustlines} price=${price}`);
      } else {
        logger.info("SYSTEM", "Skipping metrics/activity (waiting for interval)");
      }
    } catch (err) {
      logger.error("SYSTEM", "Metrics/activity history crashed", err);
    }

    const duration = ((Date.now() - cycleStart) / 1000).toFixed(2);
    logger.info("SYSTEM", `Indexer cycle completed in ${duration}s`);
    updateHealthTimestamp();
    const cycleSpacing = 45000 + workerId * 3000;
    logger.info("SYSTEM", `Waiting ${cycleSpacing / 1000}s before next cycle`);
    await sleep(cycleSpacing);
  }
}

export { startIndexer };

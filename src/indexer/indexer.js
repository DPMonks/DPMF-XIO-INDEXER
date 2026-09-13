// /src/indexer/indexer.js
// WORKER 4 — HEAVY ANALYTICS ENGINE (trustlines + AMM + LP + metrics + dynamic pools)

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from "dotenv";
dotenv.config();

// ------------------------------------------------------
// STAGGERED WORKER STARTUP (UNIFIED 90s MODEL)
// ------------------------------------------------------
const workerId = Number(process.env.WORKER_ID || 4);

// Unified: 90s per worker ID
const startupDelay = workerId * 90000; // 90s per worker

// Heavy worker → larger warm-up
const baseWarmupDelay = 8000;
const extraWarmupForHeavyWorker = 20000;
const warmupDelay = baseWarmupDelay + extraWarmupForHeavyWorker;

console.log(
  `Worker ${workerId} starting in ${(startupDelay + warmupDelay) / 1000}s…`
);

await new Promise((r) => setTimeout(r, startupDelay + warmupDelay));

console.log("ENV CHECK:", {
  XIO_ISSUER: process.env.XIO_ISSUER,
  RLUSD_ISSUER: process.env.RLUSD_ISSUER,
  AMM_ACCOUNT: process.env.AMM_ACCOUNT,
  RLUSD_AMM_ACCOUNT: process.env.RLUSD_AMM_ACCOUNT,
  LP_ISSUER: process.env.LP_ISSUER,
  LP_CURRENCY_HEX: process.env.LP_CURRENCY_HEX,
  XIO_CURRENCY: process.env.XIO_CURRENCY,
  RLUSD_CURRENCY_HEX: process.env.RLUSD_CURRENCY_HEX,
});

// IMPORTS
import staticPools from "./pools.js";
import { logger } from "../../utils/logger.js";
import { updateHealthTimestamp } from "../../health.js";
import { pool } from "../../db.js";
import { writeTokenMetrics, writeActivityHistory } from "../../dbWriter.js";

import { wsReady, fullReady } from "../../xrplClient.js";

// TRUSTLINE SCANNER
import { runTrustlineScanner } from "./trustlineScanner.js";

// AMM + LP SCANNERS
import { runAmmScannerXio } from "../ammScannerXio.js";
import { runLpScanner } from "../lpScanner.js";

// ------------------------------------------------------
// UTILS
// ------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const METRICS_INTERVAL_MS = 60 * 1000;
let lastMetricsRun = 0;

// ------------------------------------------------------
// MAIN INDEXER LOOP
// ------------------------------------------------------
async function startIndexer() {
  logger.info("SYSTEM", "Waiting for XRPL clients to be ready…");

  await wsReady;
  await fullReady;

  logger.info("SYSTEM", "XRPL clients ready — starting Worker 4 heavy analytics loop");

  while (true) {
    logger.cycle("Starting new Worker 4 cycle");
    updateHealthTimestamp();

    const cycleStart = Date.now();

    // TRUSTLINE SCAN
    try {
      logger.info("HOLDERS", "Running XIO trustline scan (ledger_data)…");
      await runTrustlineScanner();
      logger.info("HOLDERS", "XIO trustline scan completed");
    } catch (err) {
      logger.error("HOLDERS", "Trustline scanner crashed", err);
    }

    // AMM + LP SCAN (HEAVY)
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

    // METRICS + ACTIVITY HISTORY
    try {
      const now = Date.now();
      if (now - lastMetricsRun >= METRICS_INTERVAL_MS) {
        const primaryPoolName = staticPools[0]?.name || "XRP/XIO";

        const ammRes = await pool.query(
          `
          SELECT price
          FROM amm_pool_snapshots
          WHERE pool_name = $1
          ORDER BY timestamp DESC
          LIMIT 1
          `,
          [primaryPoolName]
        );

        const price = Number(ammRes.rows[0]?.price || 0);

        const holderResult = await pool.query(
          "SELECT COUNT(*) AS holders FROM xio_holders"
        );
        const holders = Number(holderResult.rows[0].holders || 0);

        const circResult = await pool.query(
          "SELECT SUM(balance) AS circ FROM xio_holders"
        );
        const circulating = Number(circResult.rows[0].circ || 0);

        const totalSupply = 10000000000;
        const marketCap = price * circulating;
        const fdv = price * totalSupply;

        await writeTokenMetrics({
          marketCap,
          fdv,
          circulating,
          totalSupply,
          holders,
          trustlines: holders,
        });

        await writeActivityHistory({
          price,
          volume: 0,
          marketcap: marketCap,
          rank: 18,
          traders: holders,
          holders,
        });

        lastMetricsRun = now;
        logger.info("SYSTEM", "Metrics/activity history updated");
      } else {
        logger.info("SYSTEM", "Skipping metrics/activity (waiting for interval)");
      }
    } catch (err) {
      logger.error("SYSTEM", "Metrics/activity history crashed", err);
    }

    const cycleEnd = Date.now();
    const duration = ((cycleEnd - cycleStart) / 1000).toFixed(2);

    logger.info("SYSTEM", `Worker 4 cycle completed in ${duration}s`);
    updateHealthTimestamp();

    // HEAVY WORKER CYCLE SPACING
    const cycleSpacing = 45000 + workerId * 3000;
    logger.info("SYSTEM", `Waiting ${cycleSpacing / 1000}s before next Worker 4 cycle`);
    await sleep(cycleSpacing);
  }
}

startIndexer().catch((err) => {
  logger.error("SYSTEM", "Fatal error in Worker 4 heavy indexer", err);
  process.exit(1);
});

export { startIndexer };


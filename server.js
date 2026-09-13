// ------------------------------------------------------
// ROOT SERVER + INDEXER BOOTSTRAP
// ------------------------------------------------------

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

// XRPL + Xaman
import { fetchAccountLines, rpcRequest } from "./xrplClient.js";
import { createPayloadBackend } from "./xaman/create-payload.js";
import payloadResult from "./xaman/payload-result.js";

// Pools config (UPDATED PATH)
import pools from "./src/indexer/pools.js";

// INDEXER TASKS
import { fetchLpHolders } from "./src/tasks/lp.js";
import { fetchAmm } from "./src/tasks/amm.js";

// Use Postgres for holder data now
import { pool } from "./db.js";

// API ROUTES
import tokenDetails from "./api/token-details.js";
import activityChart from "./api/activity-chart.js";
import tokenDetailsStatic from "./api/token-details-static.js";
import tokenDetailsLive from "./api/token-details-live.js";
import pairsHandler from "./api/pairs.js";
import bookHandler from "./api/book.js";
import ammPairHandler from "./api/amm-pair.js";
import { startLiquidPairWatcher } from "./src/tasks/liquidPairs.js";

// Continuous ledger activity writer
import "./api/services/activity-writer.js";

// INDEXER ROOT
import { startIndexer } from "./src/indexer/indexer.js";

// XRPL CLIENT CONNECTOR (REQUIRED FOR FULL-HISTORY + TRUSTLINE READINESS)
import { connectClients } from "./xrplClient.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------
// CORS
// ------------------------------------------------------
app.use(
  cors({
    origin: [
      "https://dpmf-xio-dashboard-test.vercel.app",
      "https://dpmf-xio-dashboard-iwrmet5ky-dpmf-s-projects.vercel.app",
      /\.vercel\.app$/,
      "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'dpmf-xio-indexer', ts: new Date().toISOString() });
});
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'dpmf-xio-indexer' });
});

// ------------------------------------------------------
// XAMAN SIGN-IN ROUTES
// ------------------------------------------------------
app.post("/api/xaman/create-payload", createPayloadBackend);
app.get("/api/xaman/payload-result", payloadResult);

// ------------------------------------------------------
// DASHBOARD API ROUTES
// ------------------------------------------------------

// GET /api/top-holders (NEW — uses Postgres)
app.get("/api/top-holders", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;

    const result = await pool.query(`
      SELECT account, balance, status
      FROM token_holders_latest
      ORDER BY balance DESC
      LIMIT $1
    `, [limit]);

    const ranked = result.rows.map((h, i) => ({
      ...h,
      rank: i + 1
    }));

    res.json(ranked);
  } catch (err) {
    console.error("[API][TOP HOLDERS ERROR]", err);
    res.status(500).json({ error: "Failed to fetch top holders" });
  }
});

// GET /api/top-lp
app.get("/api/top-lp", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;

    let allLp = [];

    for (const pool of pools) {
      const lp = await fetchLpHolders(pool);

      const mapped = lp.map((row) => ({
        pool: pool.name,
        account: row.account,
        lp_balance: row.lp_balance,
        frozen: row.frozen
      }));

      allLp.push(...mapped);
    }

    const sorted = allLp.sort(
      (a, b) => parseFloat(b.lp_balance) - parseFloat(a.lp_balance)
    );

    const ranked = sorted.map((h, i) => ({
      ...h,
      rank: i + 1
    }));

    res.json(ranked.slice(0, limit));
  } catch (err) {
    console.error("[API][TOP LP ERROR]", err);
    res.status(500).json({ error: "Failed to fetch LP holders" });
  }
});

// GET /api/amm
app.get("/api/amm", async (req, res) => {
  try {
    const results = [];

    for (const pool of pools) {
      const amm = await fetchAmm(pool);

      if (amm) {
        results.push({
          pool: pool.name,
          ...amm
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error("[API][AMM ERROR]", err);
    res.status(500).json({ error: "Failed to fetch AMM data" });
  }
});

// LIQUID PAIRS (XRP/RLUSD books + AMM marks — additive)
app.get("/api/pairs", pairsHandler);
app.get("/api/book/:base/:quote", bookHandler);
app.get("/api/amm/:base/:quote", ammPairHandler);

// TOKEN DETAILS + ACTIVITY CHART
app.get("/api/token-details", tokenDetails);
app.get("/api/activity-chart", activityChart);

// STATIC + LIVE TOKEN DETAILS
app.get("/api/token-details-static", tokenDetailsStatic);
app.get("/api/token-details-live", tokenDetailsLive);

// ------------------------------------------------------
// START EXPRESS SERVER
// ------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Indexer API running on port ${PORT}`);
});

// ------------------------------------------------------
// CONNECT XRPL CLIENTS (REQUIRED FOR FULL-HISTORY + TRUSTLINE READINESS)
// ------------------------------------------------------
connectClients();

// ------------------------------------------------------
// LIQUID PAIR WATCHER (XRP/RLUSD books + AMM marks)
// ------------------------------------------------------
startLiquidPairWatcher();

// ------------------------------------------------------
// START INDEXER LOOP
// ------------------------------------------------------
startIndexer();


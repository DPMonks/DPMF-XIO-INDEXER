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
import "./ensureXioCompat.js";

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

app.post("/api/xaman/create-payload", createPayloadBackend);
app.get("/api/xaman/payload-result", payloadResult);

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

app.get("/api/pairs", pairsHandler);
app.get("/api/book/:base/:quote", bookHandler);
app.get("/api/amm/:base/:quote", ammPairHandler);

app.get("/api/token-details", tokenDetails);
app.get("/api/activity-chart", activityChart);
app.get("/api/charts/activity", activityChart);
app.get("/api/overview", tokenDetails);

app.get("/api/token-details-static", tokenDetailsStatic);
app.get("/api/token-details-live", tokenDetailsLive);

async function holderCounts(_req, res) {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0)::int AS holders,
        COUNT(*)::int AS trustlines,
        MAX(updated_at) AS updated_at
      FROM token_holders_latest
    `);
    const holders = Number(result.rows[0]?.holders || 0);
    const trustlines = Number(result.rows[0]?.trustlines || 0);
    res.json({
      holders,
      count: holders,
      trustlines,
      present: holders > 0,
      catching_up: holders <= 0,
      as_of: result.rows[0]?.updated_at || null,
      source: "token_holders_latest",
    });
  } catch (err) {
    console.error("[API][HOLDERS COUNT ERROR]", err);
    res.status(500).json({ error: "Failed to count holders", catching_up: true, present: false });
  }
}

async function lpCounts(req, res) {
  try {
    const want = String(req.query.pool || req.query.pair || "all").replace(/\s+/g, "").toUpperCase();
    const result = await pool.query(`
      SELECT pool_name,
             COUNT(*) FILTER (WHERE COALESCE(lp_balance, 0) > 0)::int AS holders,
             COUNT(*)::int AS trustlines
      FROM lp_holders_latest
      GROUP BY pool_name
    `);
    const rows = result.rows || [];
    const match = (name) => {
      const n = String(name || "").replace(/\s+/g, "").toUpperCase();
      if (want === "ALL") return true;
      return n === want || n === want.split("/").reverse().join("/");
    };
    const picked = rows.filter((r) => match(r.pool_name));
    const holders = picked.reduce((s, r) => s + Number(r.holders || 0), 0);
    const trustlines = picked.reduce((s, r) => s + Number(r.trustlines || 0), 0);
    res.json({
      holders,
      count: holders,
      trustlines,
      pool: want,
      present: holders > 0,
      catching_up: holders <= 0,
      source: "lp_holders_latest",
    });
  } catch (err) {
    console.error("[API][LP COUNT ERROR]", err);
    res.status(500).json({ error: "Failed to count LP holders", catching_up: true, present: false });
  }
}

app.get("/api/holders/count", holderCounts);
app.get("/api/trustlines/count", holderCounts);
app.get("/api/lp-holders/count", lpCounts);
app.get("/api/lp-trustlines/count", lpCounts);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Indexer API listening on 0.0.0.0:${PORT}`);
});

connectClients();
startLiquidPairWatcher();
startIndexer();

import express from "express";
import pools from "../pools.js";
import { fetchAmm } from "../src/tasks/amm.js";

const router = express.Router();

// GET /api/amm
router.get("/", async (req, res) => {
  try {
    const results = [];

    for (const pool of pools) {
      console.log(`[API][AMM] Fetching AMM info for pool: ${pool.name}`);

      const amm = await fetchAmm(pool);

      if (!amm) {
        console.warn(`[API][AMM] No AMM data returned for ${pool.name}`);
        continue;
      }

      results.push({
        pool: pool.name,
        ...amm
      });
    }

    res.json(results);
  } catch (err) {
    console.error("[API][AMM ERROR]", err);
    res.status(500).json({ error: "Failed to fetch AMM data" });
  }
});

export default router;


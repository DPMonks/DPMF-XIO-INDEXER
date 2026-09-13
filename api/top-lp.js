import express from "express";
import pools from "../pools.js";
import { fetchLpHolders } from "../tasks/lp.js";

const router = express.Router();

// GET /api/top-lp
router.get("/", async (req, res) => {
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

export default router;

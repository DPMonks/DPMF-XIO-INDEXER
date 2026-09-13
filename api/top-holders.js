import express from "express";
import pools from "../pools.js";
import { fetchHholders } from "../tasks/holders.js";

const router = express.Router();

// GET /api/top-holders
router.get("/", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;

    // XIO issuer from pools.js
    const ISSUER = pools[0].issuer;

    const holders = await fetchHholders(ISSUER, true);

    // Sort numerically
    const sorted = holders.sort(
      (a, b) => parseFloat(b.balance) - parseFloat(a.balance)
    );

    // Add rank numbers
    const ranked = sorted.map((h, i) => ({
      ...h,
      rank: i + 1
    }));

    res.json(ranked.slice(0, limit));
  } catch (err) {
    console.error("[API][TOP HOLDERS ERROR]", err);
    res.status(500).json({ error: "Failed to fetch top holders" });
  }
});

export default router;

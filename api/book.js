// GET /api/book/:base/:quote — latest book snapshot (DB) with live fallback
import { pool } from "../db.js";
import { findPairDef, pairKey } from "../src/pairAssets.js";
import { fetchBookSnapshot } from "../src/tasks/book.js";
import { config } from "../config.js";

function normalizeParams(base, quote) {
  // Support /api/book/XRP/RLUSD and /api/book/XRP-RLUSD
  if (quote == null && typeof base === "string" && base.includes("-")) {
    const [b, q] = base.split("-");
    return [b, q];
  }
  return [base, quote];
}

export default async function bookHandler(req, res) {
  try {
    let { base, quote } = req.params;
    [base, quote] = normalizeParams(base, quote);
    if (!base || !quote) {
      return res.status(400).json({ error: "Usage: /api/book/:base/:quote" });
    }

    const name = pairKey(base, quote);
    const live = String(req.query.live || "") === "1";

    if (!live) {
      const dbRes = await pool.query(
        `SELECT * FROM book_snapshots
         WHERE pair_name = $1 OR pair_name = $2
         ORDER BY timestamp DESC
         LIMIT 1`,
        [name, `${String(quote).toUpperCase()}/${String(base).toUpperCase()}`]
      );
      if (dbRes.rows[0]) {
        const row = dbRes.rows[0];
        return res.json({
          source: "db",
          pair: row.pair_name,
          bid: row.bid,
          ask: row.ask,
          mid: row.mid,
          spread: row.spread,
          spread_bps: row.spread_bps,
          bid_depth_base: row.bid_depth_base,
          ask_depth_base: row.ask_depth_base,
          bid_depth_quote: row.bid_depth_quote,
          ask_depth_quote: row.ask_depth_quote,
          bid_count: row.bid_count,
          ask_count: row.ask_count,
          bids: row.bids,
          asks: row.asks,
          timestamp: row.timestamp
        });
      }
    }

    const def = findPairDef(base, quote);
    if (!def) {
      return res.status(404).json({
        error: `Unknown pair ${name}`,
        hint: "Known: " + (config.watchPairs || []).join(", ")
      });
    }

    const snap = await fetchBookSnapshot(def, config.bookDepth);
    return res.json({ source: "live", ...snap });
  } catch (err) {
    console.error("[API][BOOK ERROR]", err);
    res.status(500).json({ error: "Failed to fetch book" });
  }
}

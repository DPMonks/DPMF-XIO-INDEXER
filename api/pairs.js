// GET /api/pairs — liquid watch pairs + latest marks / liquidity hints
import { pool } from "../db.js";
import { config } from "../config.js";
import { getWatchPairDefs } from "../src/pairAssets.js";

export default async function pairsHandler(req, res) {
  try {
    const defs = getWatchPairDefs(config.watchPairs);
    const marks = await pool.query(
      `SELECT pair_name, bid, ask, mid, spread_bps,
              bid_depth_base, ask_depth_base,
              amm_price, amm_account, amm_amount_a, amm_amount_b,
              liquid, updated_at
       FROM pair_marks_latest`
    );
    const byName = Object.fromEntries(
      marks.rows.map((r) => [r.pair_name, r])
    );

    const pairs = defs.map((d) => {
      const m = byName[d.name] || null;
      const bookDepth =
        Number(m?.bid_depth_base || 0) + Number(m?.ask_depth_base || 0);
      const ammTvlApprox =
        Number(m?.amm_amount_a || 0) + Number(m?.amm_amount_b || 0);
      return {
        pair: d.name,
        base: d.tokenA,
        quote: d.tokenB,
        liquid: true,
        mid: m?.mid ?? null,
        bid: m?.bid ?? null,
        ask: m?.ask ?? null,
        spread_bps: m?.spread_bps ?? null,
        book_depth_base: bookDepth || null,
        amm_price: m?.amm_price ?? null,
        amm_account: m?.amm_account ?? null,
        amm_amount_a: m?.amm_amount_a ?? null,
        amm_amount_b: m?.amm_amount_b ?? null,
        liquidity_hint: {
          book_depth_base: bookDepth || 0,
          amm_tvl_approx: ammTvlApprox || 0,
          has_amm: Boolean(m?.amm_account || (m?.amm_price != null && Number(m.amm_price) > 0))
        },
        updated_at: m?.updated_at ?? null,
        endpoints: {
          book: `/api/book/${d.name}`,
          amm: `/api/amm/${d.name}`
        }
      };
    });

    res.json({
      watch_pairs: config.watchPairs,
      pairs,
      rlusd: {
        issuer: process.env.RLUSD_ISSUER || config.rlusdIssuer,
        currency: process.env.RLUSD_CURRENCY || config.rlusdCurrency,
        currency_hex: process.env.RLUSD_CURRENCY_HEX || config.rlusdCurrencyHex
      }
    });
  } catch (err) {
    console.error("[API][PAIRS ERROR]", err);
    res.status(500).json({ error: "Failed to list pairs" });
  }
}

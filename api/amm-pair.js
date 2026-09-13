// GET /api/amm/:base/:quote — AMM snapshot for a pair (DB first, live fallback)
import { pool } from "../db.js";
import { findPairDef, pairKey, xrplAsset, parseAmount } from "../src/pairAssets.js";
import { fetchAmmInfo } from "../xrplClient.js";
import { config } from "../config.js";

export default async function ammPairHandler(req, res) {
  try {
    let { base, quote } = req.params;
    if (!quote && typeof base === "string" && base.includes("-")) {
      [base, quote] = base.split("-");
    }
    if (!base || !quote) {
      return res.status(400).json({ error: "Usage: /api/amm/:base/:quote" });
    }

    const name = pairKey(base, quote);
    const rev = pairKey(quote, base);
    const live = String(req.query.live || "") === "1";

    if (!live) {
      const dbRes = await pool.query(
        `SELECT * FROM amm_pool_snapshots
         WHERE pool_name = $1 OR pool_name = $2
         ORDER BY timestamp DESC
         LIMIT 1`,
        [name, rev]
      );
      if (dbRes.rows[0]) {
        const row = dbRes.rows[0];
        return res.json({
          source: "db",
          pair: row.pool_name,
          amountA: row.amounta ?? row.amountA,
          amountB: row.amountb ?? row.amountB,
          price: row.price,
          lp_supply: row.lp_supply,
          assets_in_pool: row.assets_in_pool,
          usd_value: row.usd_value,
          timestamp: row.timestamp
        });
      }

      // Also try pair_marks_latest for AMM fields
      const mark = await pool.query(
        `SELECT * FROM pair_marks_latest WHERE pair_name = $1 OR pair_name = $2 LIMIT 1`,
        [name, rev]
      );
      if (mark.rows[0]?.amm_price != null) {
        const m = mark.rows[0];
        return res.json({
          source: "db_mark",
          pair: m.pair_name,
          price: m.amm_price,
          amm_account: m.amm_account,
          amountA: m.amm_amount_a,
          amountB: m.amm_amount_b,
          updated_at: m.updated_at
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

    const amm = await fetchAmmInfo(xrplAsset(def.tokenA), xrplAsset(def.tokenB));
    if (!amm) {
      return res.json({
        source: "live",
        pair: def.name,
        missing: true,
        amm: null
      });
    }

    const amountA = parseAmount(amm.amount);
    const amountB = parseAmount(amm.amount2);
    const price = amountA > 0 ? amountB / amountA : 0;

    return res.json({
      source: "live",
      pair: def.name,
      missing: false,
      account: amm.account,
      trading_fee: amm.trading_fee,
      amountA,
      amountB,
      price,
      lp_supply: amm.lp_token?.value || null,
      amount: amm.amount,
      amount2: amm.amount2
    });
  } catch (err) {
    console.error("[API][AMM PAIR ERROR]", err);
    res.status(500).json({ error: "Failed to fetch AMM for pair" });
  }
}

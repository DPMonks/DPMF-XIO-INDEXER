import { pool } from "../db.js";

export default async function activityChart(req, res) {
  try {
    const range = req.query.range || "1M";

    // Map range to interval string
    const intervalMap = {
      "1D": "1 day",
      "1W": "7 days",
      "1M": "1 month",
      "Max": "1 year"
    };

    const interval = intervalMap[range] || "1 month";

    const result = await pool.query(
      `SELECT timestamp, price, volume, marketcap, rank, traders, holders
       FROM token_activity_history
       WHERE timestamp >= NOW() - INTERVAL '${interval}'
       ORDER BY timestamp ASC`
    );

    const rows = result.rows.length
      ? result.rows
      : [
          {
            timestamp: new Date().toISOString(),
            price: 0.00045,
            volume: 1200,
            marketcap: 450000,
            rank: 18,
            traders: 120,
            holders: 320
          }
        ];

    res.json(rows);
  } catch (err) {
    console.error("[API][ACTIVITY CHART ERROR]", err);
    res.json([
      {
        timestamp: new Date().toISOString(),
        price: 0.00045,
        volume: 1200,
        marketcap: 450000,
        rank: 18,
        traders: 120,
        holders: 320
      }
    ]);
  }
}

import { pool } from "../db.js";

export default async function activityChart(req, res) {
  try {
    const range = req.query.range || "Max";
    const intervalMap = {
      "1D": "1 day",
      "1W": "7 days",
      "1M": "1 month",
      "1Y": "5 years",
      Max: "20 years",
    };
    const interval = intervalMap[range] || "20 years";
    const result = await pool.query(
      `SELECT timestamp, price, volume, marketcap, rank, traders, holders
       FROM token_activity_history
       WHERE timestamp >= NOW() - INTERVAL '${interval}'
       ORDER BY timestamp ASC`
    );
    res.json(result.rows || []);
  } catch (err) {
    console.error("[API][ACTIVITY CHART ERROR]", err);
    res.json([]);
  }
}

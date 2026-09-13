import { pool } from "../../db.js";
import { rpcRequest } from "../../xrplClient.js";

const ISSUER = process.env.XIO_ISSUER;
const XIO = process.env.XIO_CURRENCY; // ASCII code for XIO

export async function updateActivityHistory() {
  try {
    const ammInfo = await rpcRequest({
      method: "amm_info",
      params: [
        {
          asset: { currency: XIO, issuer: ISSUER },
          asset2: { currency: "XRP" }   // native, no issuer
        }
      ]
    });

    const amm = ammInfo?.result?.amm;
    if (!amm) {
      console.warn("[ACTIVITY] No AMM data found");
      return;
    }

    // AMM amounts
    const amount1 = Number(amm.amount.value);      // XIO
    const amount2 = Number(amm.amount2.value);     // XRP

    // Price = XRP per XIO
    const price = amount2 / amount1;

    // Volume = XIO side
    const volume = amount1;

    // Market cap estimate
    const marketcap = volume * price;

    // Temporary placeholders
    const rank = 1;
    const traders = Math.floor(Math.random() * 1000);
    const holders = Math.floor(Math.random() * 2000);

    await pool.query(
      `
      INSERT INTO token_activity_history 
      (timestamp, price, volume, marketcap, rank, traders, holders)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6)
      `,
      [price, volume, marketcap, rank, traders, holders]
    );

    console.log("[ACTIVITY] Ledger snapshot written successfully");
  } catch (err) {
    console.error("[ACTIVITY] Failed to write ledger snapshot", err);
  }
}

setInterval(updateActivityHistory, 60000);

import { pool } from "../db.js";
import { rpcRequest, fetchAllTrustlines, normalizeCurrency } from "../xrplClient.js";

const ISSUER = process.env.XIO_ISSUER;
const TOKEN_CODE = "XIO";
const USD_ISSUER = "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq";

// Total supply of XIO on XRPL (fixed)
const TOTAL_SUPPLY = 10000000000; // 10 billion XIO

export default async function tokenDetailsLive(req, res) {
  try {
    // 1. TRUSTLINES (full pagination)
    const lines = await fetchAllTrustlines(ISSUER);

    const xioLines = lines.filter(
      l => normalizeCurrency(l.currency) === TOKEN_CODE
    );

    const trustlines = xioLines.length;

    const holders = xioLines.filter(
      l => Number(l.balance) > 0
    ).length;

    // 2. ISSUER BALANCE (burned supply)
    const issuerLines = await rpcRequest({
      method: "account_lines",
      params: [{
        account: ISSUER,
        ledger_index: "validated"
      }]
    });

    let issuerBalance = 0;

    if (issuerLines?.result?.lines) {
      const issuerLine = issuerLines.result.lines.find(
        l => normalizeCurrency(l.currency) === TOKEN_CODE && l.account === ISSUER
      );

      issuerBalance = issuerLine ? Number(issuerLine.balance) : 0;
    }

    const burnedSupply = issuerBalance;
    const circulating = TOTAL_SUPPLY - burnedSupply;

    // 3. AMM PRICE + AMM LIQUIDITY
    const ammInfo = await rpcRequest({
      method: "amm_info",
      params: [{
        asset: { currency: TOKEN_CODE, issuer: ISSUER },
        asset2: { currency: "USD", issuer: USD_ISSUER }
      }]
    });

    const amm = ammInfo?.result?.amm;
    let priceUSD = 0;
    let ammLiquidityXIO = 0;

    if (amm) {
      const { amount, amount2 } = amm;

      ammLiquidityXIO = Number(amount.value);
      priceUSD = Number(amount2.value) / Number(amount.value);
    }

    // 4. Market caps
    const ammMarketCap = ammLiquidityXIO * priceUSD;
    const xrplMarketCap = TOTAL_SUPPLY * priceUSD;
    const circulatingMarketCap = circulating * priceUSD;

    // 5. ATH / ATL
    const history = await pool.query(`
      SELECT price, timestamp
      FROM token_activity_history
      ORDER BY timestamp ASC
    `);

    let ath = { price: 0, date: "N/A" };
    let atl = { price: Infinity, date: "N/A" };

    history.rows.forEach(row => {
      const p = Number(row.price);
      const d = row.timestamp.toISOString().split("T")[0];

      if (p > ath.price) ath = { price: p, date: d };
      if (p < atl.price) atl = { price: p, date: d };
    });

    if (atl.price === Infinity) atl.price = 0;

    // 6. RANK (based on XRPL-wide market cap)
    const rankQuery = await pool.query(`
      SELECT market_cap
      FROM token_metrics_latest
      ORDER BY market_cap DESC
    `);

    const rank = rankQuery.rows.findIndex(
      r => Number(r.market_cap) === Number(xrplMarketCap)
    ) + 1;

    // 7. Final response
    const response = {
      holders,
      trustlines,
      burnedSupply,
      circulating,
      totalSupply: TOTAL_SUPPLY,
      priceUSD,
      ammLiquidityXIO,
      ammMarketCap,
      xrplMarketCap,
      circulatingMarketCap,
      ath,
      atl,
      rank
    };

    if (res?.json) return res.json(response);
    return response;

  } catch (err) {
    console.error("[API][LIVE TOKEN DETAILS ERROR]", err);
    if (res?.json) return res.status(500).json({ error: "Failed to fetch live token details" });
    throw err;
  }
}

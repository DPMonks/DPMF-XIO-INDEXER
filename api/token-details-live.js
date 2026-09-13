import { pool } from "../db.js";
import { rpcRequest, fetchAllTrustlines, normalizeCurrency } from "../xrplClient.js";

const ISSUER = process.env.XIO_ISSUER || "rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU";
const TOKEN_CODE = "XIO";
const TOKEN_HEX = process.env.XIO_CURRENCY_HEX || "58494F0000000000000000000000000000000000";
const AMM_ACCOUNT = process.env.AMM_ACCOUNT || "rPYfrbCvJGGEs9ddUtRiq58kCJBw9hoGij";
const TOTAL_SUPPLY = 10_000;
const XIO_MD5 = "850edef1e93476d34aac3e8aaa03943b";

function isXio(code) {
  const n = normalizeCurrency(code);
  const up = String(code || "").toUpperCase();
  return n === TOKEN_CODE || up === TOKEN_HEX || up === "XIO";
}

async function countsFromDb() {
  try {
    const res = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(balance, 0) > 0) AS holders,
        COUNT(*) AS trustlines,
        COALESCE(SUM(balance) FILTER (WHERE COALESCE(balance, 0) > 0), 0) AS circulating
      FROM token_holders_latest
    `);
    return {
      holders: Number(res.rows[0]?.holders || 0),
      trustlines: Number(res.rows[0]?.trustlines || 0),
      circulating: Number(res.rows[0]?.circulating || 0),
    };
  } catch {
    return { holders: 0, trustlines: 0, circulating: 0 };
  }
}

async function countsFromLedger() {
  const lines = await fetchAllTrustlines(ISSUER);
  const xioLines = (lines || []).filter((l) => isXio(l.currency));
  const holders = xioLines.filter((l) => Math.abs(Number(l.balance) || 0) > 0).length;
  return {
    holders,
    trustlines: xioLines.length,
    circulating: xioLines.reduce((sum, l) => sum + Math.abs(Number(l.balance) || 0), 0),
  };
}

async function countsFromXrplTo() {
  try {
    const body = await fetch(`https://api.xrpl.to/v1/token/${XIO_MD5}`, {
      headers: { Accept: "application/json", "User-Agent": "DPMF-XIO-Indexer" },
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.json());
    const t = body?.token || {};
    return {
      holders: Number(t.holders || 0),
      trustlines: Number(t.trustlines || 0),
      circulating: Number(t.supply || t.amount || 0),
      priceXrp: Number(t.exch || 0),
      priceUSD: Number(t.usd || 0),
      tvl: Number(t.tvl || 0),
    };
  } catch {
    return { holders: 0, trustlines: 0, circulating: 0 };
  }
}

export default async function tokenDetailsLive(req, res) {
  try {
    let db = await countsFromDb();
    if (!db.holders && !db.trustlines) {
      try {
        db = await countsFromLedger();
      } catch (err) {
        console.warn("[API][LIVE] ledger holders failed", err?.message || err);
      }
    }
    const pub = await countsFromXrplTo();
    const holders = db.holders || pub.holders || 0;
    const trustlines = db.trustlines || pub.trustlines || 0;
    const circulating = db.circulating || pub.circulating || 0;
    const burnedSupply = Math.max(0, TOTAL_SUPPLY - circulating);

    const ammInfo = await rpcRequest({
      method: "amm_info",
      params: [{
        asset: { currency: TOKEN_CODE, issuer: ISSUER },
        asset2: { currency: "XRP" },
        ledger_index: "validated",
      }],
    });
    const amm = ammInfo?.result?.amm || ammInfo?.result?.result?.amm;
    let priceXrp = pub.priceXrp || 0;
    let ammLiquidityXIO = 0;
    if (amm) {
      const a = amm.amount;
      const b = amm.amount2;
      const xioAmt = typeof a === "object" && a?.issuer === ISSUER ? Number(a.value) : Number(b?.value || 0);
      const xrpAmt = typeof a === "string" ? Number(a) / 1e6 : (typeof b === "string" ? Number(b) / 1e6 : 0);
      ammLiquidityXIO = xioAmt;
      if (xioAmt > 0 && xrpAmt > 0) priceXrp = xrpAmt / xioAmt;
    }

    const priceUSD = pub.priceUSD || (priceXrp ? priceXrp * 1.35 : 0);
    const ammMarketCap = pub.tvl || (ammLiquidityXIO * priceUSD);
    const xrplMarketCap = TOTAL_SUPPLY * priceUSD;
    const circulatingMarketCap = circulating * priceUSD;

    let history = { rows: [] };
    try {
      history = await pool.query(`SELECT price, timestamp FROM token_activity_history ORDER BY timestamp ASC`);
    } catch {}

    let ath = { price: 0, date: "N/A" };
    let atl = { price: Infinity, date: "N/A" };
    for (const row of history.rows || []) {
      const p = Number(row.price);
      if (!(p > 0)) continue;
      const d = (row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp)).toISOString().split("T")[0];
      if (p > ath.price) ath = { price: p, date: d };
      if (p < atl.price) atl = { price: p, date: d };
    }
    if (atl.price === Infinity) atl.price = 0;

    const response = {
      holders,
      trustlines,
      holder_count: holders,
      trustline_count: trustlines,
      burnedSupply,
      circulating,
      totalSupply: TOTAL_SUPPLY,
      priceUSD,
      price: priceUSD,
      xioXrp: priceXrp,
      ammLiquidityXIO,
      ammMarketCap,
      xrplMarketCap,
      circulatingMarketCap,
      ath,
      atl,
      rank: 0,
      source: db.holders ? "db" : pub.holders ? "xrpl.to" : "live",
      ammAccount: AMM_ACCOUNT,
    };
    if (res?.json) return res.json(response);
    return response;
  } catch (err) {
    console.error("[API][LIVE TOKEN DETAILS ERROR]", err);
    if (res?.json) return res.status(500).json({ error: "Failed to fetch live token details" });
    throw err;
  }
}

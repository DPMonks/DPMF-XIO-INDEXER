// src/tasks/book.js — book_offers both sides + mid/spread for liquid pairs
import { rpcRequest } from "../../xrplClient.js";
import { config } from "../../config.js";
import { xrplAsset, parseAmount } from "../pairAssets.js";

function unwrapResult(res) {
  if (!res) return null;
  // rpcRequest returns { result: clientResponse } where clientResponse has .result
  if (res.result?.result) return res.result.result;
  if (res.result?.offers || res.result?.amm) return res.result;
  if (res.offers || res.amm) return res;
  return res.result || res;
}

function offerQuotePerBase(offer, { baseIsTakerPays }) {
  const gets = offer.TakerGets;
  const pays = offer.TakerPays;
  const g = parseAmount(gets);
  const p = parseAmount(pays);
  if (!g || !p || g <= 0 || p <= 0) return null;
  // quote-per-base
  if (baseIsTakerPays) {
    // taker pays base, gets quote → quote/base = g/p
    return g / p;
  }
  // taker pays quote, gets base → quote/base = p/g
  return p / g;
}

function summarizeSide(offers, { baseIsTakerPays }) {
  const rows = [];
  let depthBase = 0;
  let depthQuote = 0;
  for (const o of offers || []) {
    const px = offerQuotePerBase(o, { baseIsTakerPays });
    const gets = parseAmount(o.TakerGets);
    const pays = parseAmount(o.TakerPays);
    if (px == null) continue;
    const baseAmt = baseIsTakerPays ? pays : gets;
    const quoteAmt = baseIsTakerPays ? gets : pays;
    depthBase += baseAmt;
    depthQuote += quoteAmt;
    rows.push({
      account: o.Account || o.account || null,
      price: px,
      base: baseAmt,
      quote: quoteAmt
    });
  }
  return { rows, depthBase, depthQuote, top: rows[0]?.price ?? null };
}

/**
 * Snapshot both sides of an order book.
 * asks: sell base for quote (taker gets quote, pays base)
 * bids: buy base with quote (taker gets base, pays quote)
 */
export async function fetchBookSnapshot(pairDef, depth) {
  const limit = Math.max(3, Math.min(Number(depth || config.bookDepth) || 20, 50));
  const base = xrplAsset(pairDef.tokenA);
  const quote = xrplAsset(pairDef.tokenB);

  const [asksRes, bidsRes] = await Promise.all([
    rpcRequest({
      method: "book_offers",
      params: [{ taker_gets: quote, taker_pays: base, limit, ledger_index: "validated" }]
    }),
    rpcRequest({
      method: "book_offers",
      params: [{ taker_gets: base, taker_pays: quote, limit, ledger_index: "validated" }]
    })
  ]);

  const asksRaw = unwrapResult(asksRes)?.offers || [];
  const bidsRaw = unwrapResult(bidsRes)?.offers || [];

  const asks = summarizeSide(asksRaw, { baseIsTakerPays: true });
  const bids = summarizeSide(bidsRaw, { baseIsTakerPays: false });

  let askPx = asks.top;
  let bidPx = bids.top;
  if (askPx != null && bidPx != null && askPx < bidPx) {
    // normalize inverted layout
    const tmp = askPx;
    askPx = bidPx;
    bidPx = tmp;
  }

  let mid = null;
  if (askPx != null && bidPx != null) mid = (askPx + bidPx) / 2;
  else if (askPx != null) mid = askPx;
  else if (bidPx != null) mid = bidPx;

  let spread = null;
  let spreadBps = null;
  if (askPx != null && bidPx != null && mid && mid > 0) {
    spread = askPx - bidPx;
    spreadBps = (spread / mid) * 10000;
  }

  return {
    pair: pairDef.name,
    base,
    quote,
    bid: bidPx,
    ask: askPx,
    mid,
    spread,
    spread_bps: spreadBps,
    bid_depth_base: bids.depthBase,
    ask_depth_base: asks.depthBase,
    bid_depth_quote: bids.depthQuote,
    ask_depth_quote: asks.depthQuote,
    bid_count: bids.rows.length,
    ask_count: asks.rows.length,
    bids: bids.rows.slice(0, limit),
    asks: asks.rows.slice(0, limit),
    timestamp: new Date().toISOString()
  };
}

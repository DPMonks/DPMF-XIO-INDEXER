// Periodic liquid-pair scanner: books + AMM marks for XRP/RLUSD (+ XIO pairs)
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";
import { fetchAmmInfo } from "../../xrplClient.js";
import {
  getWatchPairDefs,
  xrplAsset,
  parseAmount
} from "../pairAssets.js";
import { fetchBookSnapshot } from "./book.js";
import {
  writeBookSnapshot,
  writePairMark,
  writeAmmSnapshot
} from "../../dbWriter.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scanAmm(pairDef) {
  try {
    const asset = xrplAsset(pairDef.tokenA);
    const asset2 = xrplAsset(pairDef.tokenB);
    const amm = await fetchAmmInfo(asset, asset2);
    if (!amm) return null;

    const amountA = parseAmount(amm.amount);
    const amountB = parseAmount(amm.amount2);
    // price as tokenB per tokenA (quote per base)
    const price = amountA > 0 ? amountB / amountA : 0;
    const lpSupply = Number(amm.lp_token?.value || 0);

    return {
      name: pairDef.name,
      amountA,
      amountB,
      price,
      lpSupply,
      assets_in_pool: 2,
      usdValue: null,
      account: amm.account || null,
      trading_fee: amm.trading_fee ?? null,
      raw: {
        amount: amm.amount,
        amount2: amm.amount2,
        lp_token: amm.lp_token
      }
    };
  } catch (err) {
    logger.error("LIQUID", `AMM scan failed for ${pairDef.name}`, err?.message || err);
    return null;
  }
}

export async function runLiquidPairScan() {
  const pairs = getWatchPairDefs(config.watchPairs);
  logger.info("LIQUID", `Scanning ${pairs.length} watch pairs`, pairs.map((p) => p.name));

  for (const pairDef of pairs) {
    try {
      const book = await fetchBookSnapshot(pairDef, config.bookDepth);
      await writeBookSnapshot(book);

      const amm = await scanAmm(pairDef);
      if (amm) {
        await writeAmmSnapshot(amm.name, amm);
      }

      await writePairMark({
        pair: pairDef.name,
        bid: book.bid,
        ask: book.ask,
        mid: book.mid,
        spread_bps: book.spread_bps,
        bid_depth_base: book.bid_depth_base,
        ask_depth_base: book.ask_depth_base,
        amm_price: amm?.price ?? null,
        amm_account: amm?.account ?? null,
        amm_amount_a: amm?.amountA ?? null,
        amm_amount_b: amm?.amountB ?? null,
        liquid: true
      });

      logger.info(
        "LIQUID",
        `${pairDef.name} mid=${book.mid ?? "n/a"} spread_bps=${book.spread_bps ?? "n/a"} amm=${amm ? "yes" : "no"}`
      );
    } catch (err) {
      logger.error("LIQUID", `Pair scan failed ${pairDef.name}`, err?.message || err);
    }
    await sleep(400);
  }
}

let _timer = null;
let _running = false;

export function startLiquidPairWatcher() {
  const interval = config.bookSyncInterval || 30000;
  logger.info("LIQUID", `Starting liquid pair watcher every ${interval / 1000}s`);

  const tick = async () => {
    if (_running) return;
    _running = true;
    try {
      await runLiquidPairScan();
    } catch (err) {
      logger.error("LIQUID", "Watcher cycle crashed", err?.message || err);
    } finally {
      _running = false;
    }
  };

  // first run after short delay so XRPL clients can connect
  setTimeout(tick, 8000);
  _timer = setInterval(tick, interval);
  return _timer;
}

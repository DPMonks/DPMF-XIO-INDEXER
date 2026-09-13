// src/tasks/amm.js
import { rpcRequest } from "../../xrplClient.js";
import { xrplAsset, parseAmount } from "../pairAssets.js";

function unwrap(res) {
  if (!res) return null;
  if (res.result?.result) return res.result.result;
  if (res.result?.amm) return res.result;
  return res.result || res;
}

export async function fetchAmm(pool) {
  try {
    const params = {
      asset: xrplAsset(pool.tokenA),
      asset2: xrplAsset(pool.tokenB),
      ledger_index: "current"
    };

    const res = await rpcRequest({
      method: "amm_info",
      params: [params]
    });

    const amm = unwrap(res)?.amm;
    if (!amm) {
      console.warn("[AMM] No AMM info returned for", pool.name);
      return null;
    }

    const amountA = parseAmount(amm.amount);
    const amountB = parseAmount(amm.amount2);

    return {
      asset: pool.tokenA.currency,
      currency: pool.tokenB.display || pool.tokenB.currency,
      reserve_asset: String(amountA),
      reserve_currency: String(amountB),
      lp_supply: amm.lp_token?.value || "0",
      trading_fee: amm.trading_fee || "0",
      tvl: String(amountA),
      account: amm.account || null
    };
  } catch (err) {
    console.error("[AMM ERROR]", err);
    return null;
  }
}

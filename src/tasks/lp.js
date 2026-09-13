// src/tasks/lp.js
import { rpcRequest } from "../../xrplClient.js";

export async function fetchLpHolders(pool) {
  try {
    const issuer = pool.amm_issuer;

    // Use ASCII LP currency (preferred), fallback to HEX if needed
    const lpCurrency = pool.lp_currency || pool.lp_currency_hex;

    const params = {
      account: issuer,
      ledger_index: "validated",
      limit: 400
    };

    const res = await rpcRequest({
      method: "account_lines",
      params: [params]
    });

    if (!res?.result?.lines) {
      console.warn("[LP] No trustlines returned");
      return [];
    }

    // Filter trustlines for LP token currency
    const filtered = res.result.lines.filter(
      line => line.currency === lpCurrency
    );

    return filtered.map(line => ({
      account: line.account,
      lp_balance: line.balance || "0",
      frozen: Boolean(line.freeze) || false
    }));

  } catch (err) {
    console.error("[LP ERROR]", err);
    return [];
  }
}

// xrplClient.js (ROOT LEVEL)
// Unified XRPL client — trustlines on cluster, AMM/LP/issuer history on full-history node

import xrpl from "xrpl";
import dotenv from "dotenv";
dotenv.config();

/**
 * XRPL connection backoff helper
 */
async function connectWithBackoff(client, label) {
  const backoffMs = Number(process.env.XRPL_BACKOFF_MS) || 5000;
  try {
    console.log(`[XRPL] Connecting ${label} WebSocket…`);
    await client.connect();
    console.log(`[XRPL] ${label} WebSocket connected`);
  } catch (err) {
    console.error(`[XRPL] ${label} connection failed:`, err.message);
    console.log(`[XRPL] Retrying in ${backoffMs / 1000}s…`);
    await new Promise((r) => setTimeout(r, backoffMs));
    return connectWithBackoff(client, label);
  }
}

/**
 * PRIMARY CLIENT (trustlines + holders + Xaman sign-in)
 */
let wsClient;
export function getWsClient() {
  if (!wsClient) {
    wsClient = new xrpl.Client(process.env.XRPL_WS || "wss://xrpl.ws");
    connectWithBackoff(wsClient, "Trustline/Xaman");
  }
  return wsClient;
}

/**
 * FULL-HISTORY CLIENT (AMM + LP + issuer history)
 */
let fullHistoryClient;
export function getFullHistoryClient() {
  if (!fullHistoryClient) {
    fullHistoryClient = new xrpl.Client(
      process.env.XRPL_FULL_HISTORY_WS || "wss://s2.ripple.com:51234"
    );

    // Unified stagger for full-history: default 90s, override via env if needed
    const stagger = Number(process.env.XRPL_FULL_STAGGER_MS) || 90000;
    setTimeout(
      () => connectWithBackoff(fullHistoryClient, "Full-History"),
      stagger
    );
  }
  return fullHistoryClient;
}

// readiness promises
let wsReadyResolve;
let fullReadyResolve;

export const wsReady = new Promise((resolve) => (wsReadyResolve = resolve));
export const fullReady = new Promise((resolve) => (fullReadyResolve = resolve));

/**
 * Connect both clients (once, at startup)
 */
export async function connectClients() {
  const ws = getWsClient();
  const full = getFullHistoryClient();

  await ws.connect().catch(() => {});
  wsReadyResolve?.();

  await full.connect().catch(() => {});
  fullReadyResolve?.();
}

/* ------------------------------------------------------
   DYNAMIC RATE CONTROL
------------------------------------------------------ */
let lastDelay = 200; // base delay tuned for heavy indexer load
const minDelay = 100;
const maxDelay = 1200;

async function adaptiveSleep() {
  await new Promise((r) => setTimeout(r, lastDelay));
}

function adjustDelay(errMessage) {
  if (errMessage?.includes("slowDown")) {
    lastDelay = Math.min(lastDelay + 150, maxDelay);
    console.warn(`[XRPL] Node throttled — increasing delay to ${lastDelay}ms`);
  } else {
    lastDelay = Math.max(lastDelay - 25, minDelay);
  }
}

/* ------------------------------------------------------
   DEFAULT RPC REQUEST (trustlines + holders + Xaman)
------------------------------------------------------ */
export async function rpcRequest(body) {
  try {
    const client = getWsClient();
    await wsReady;

    await adaptiveSleep();

    const params = body.params?.[0] || {};

    if (body.method === "account_lines" && params?.account) {
      console.log(`[XAMAN DIAGNOSTIC] account_lines request for ${params.account}`);
    }

    const response = await client.request({
      command: body.method,
      ...params,
    });

    adjustDelay(null);
    return { result: response };
  } catch (err) {
    adjustDelay(err.message || err);
    console.error("[XRPL RPC ERROR]", err.message || err);
    return null;
  }
}

/* ------------------------------------------------------
   FULL-HISTORY RPC REQUEST (AMM + LP + issuer)
------------------------------------------------------ */
export async function rpcRequestFull(body) {
  try {
    const client = getFullHistoryClient();
    await fullReady;

    await adaptiveSleep();

    const params = body.params?.[0] || {};
    const response = await client.request({
      command: body.method,
      ...params,
    });

    adjustDelay(null);
    return { result: response };
  } catch (err) {
    adjustDelay(err.message || err);
    console.error("[XRPL FULL RPC ERROR]", err.message || err);
    return null;
  }
}

/* ------------------------------------------------------
   CURRENCY NORMALISATION
------------------------------------------------------ */
export function normalizeCurrency(code) {
  if (!code) return "";
  if (code.length === 40) {
    try {
      return Buffer.from(code, "hex").toString("utf8").replace(/\0/g, "");
    } catch {
      return code;
    }
  }
  return code;
}

/* ------------------------------------------------------
   FETCH LEDGER WITH TRANSACTIONS (expand: true)
------------------------------------------------------ */
export async function fetchLedgerExpanded(ledgerIndex) {
  const client = getFullHistoryClient();
  await fullReady;

  await adaptiveSleep();

  try {
    const res = await client.request({
      command: "ledger",
      ledger_index: ledgerIndex,
      transactions: true,
      expand: true,
    });

    adjustDelay(null);
    return res?.result || null;
  } catch (err) {
    adjustDelay(err.message || err);
    console.warn("[XRPL] ledger fetch failed", ledgerIndex, err?.data || err?.message || err);
    return null;
  }
}

/* ------------------------------------------------------
   FETCH LATEST VALIDATED LEDGER INDEX
------------------------------------------------------ */
export async function fetchLatestLedgerIndex() {
  const client = getFullHistoryClient();
  await fullReady;

  const res = await client.request({
    command: "ledger",
    ledger_index: "validated",
  });

  return res?.result?.ledger_index;
}

/* ------------------------------------------------------
   FETCH ALL TRUSTLINES FOR AN ACCOUNT
------------------------------------------------------ */
export async function fetchAllTrustlines(account) {
  const all = [];
  let marker = undefined;

  while (true) {
    const params = {
      account,
      ledger_index: "validated",
      limit: 400,
    };

    if (marker) params.marker = marker;

    const json = await rpcRequest({
      method: "account_lines",
      params: [params],
    });

    if (!json?.result?.lines) break;

    all.push(...json.result.lines);

    if (!json.result.marker) break;

    marker = json.result.marker;
  }

  return all;
}

export async function fetchAccountLines(account) {
  return fetchAllTrustlines(account);
}

/* ------------------------------------------------------
   AMM INFO
------------------------------------------------------ */
function unwrapRpc(json) {
  if (!json) return null;
  if (json.result?.result) return json.result.result;
  if (json.result?.amm || json.result?.offers || json.result?.lines) return json.result;
  return json.result || json;
}

export async function fetchAmmInfo(asset, asset2) {
  const json = await rpcRequestFull({
    method: "amm_info",
    params: [
      {
        asset,
        asset2,
        ledger_index: "validated",
      },
    ],
  });

  const payload = unwrapRpc(json);
  return payload?.amm || null;
}

/* ------------------------------------------------------
   DISCOVER ALL POOLS WHERE XIO APPEARS
------------------------------------------------------ */
export async function discoverXioPools(xioCurrency, xioIssuer) {
  const client = getFullHistoryClient();
  await fullReady;

  const pools = [];
  let marker = undefined;

  while (true) {
    const request = {
      command: "ledger_data",
      ledger_index: "validated",
      limit: 200,
      type: "amm",
    };

    if (marker) request.marker = marker;

    await adaptiveSleep();

    const response = await client.request(request);
    adjustDelay(null);

    const state = response?.state || [];
    for (const entry of state) {
      if (entry.LedgerEntryType !== "AMM") continue;

      const { Asset, Asset2, LPTokenBalance, TradingFee, Account: ammAccount } =
        entry;

      const isXioInAsset =
        Asset?.currency === xioCurrency &&
        (!Asset?.issuer || Asset?.issuer === xioIssuer);

      const isXioInAsset2 =
        Asset2?.currency === xioCurrency &&
        (!Asset2?.issuer || Asset2?.issuer === xioIssuer);

      if (!isXioInAsset && !isXioInAsset2) continue;

      pools.push({
        asset: Asset,
        asset2: Asset2,
        lp_token: LPTokenBalance,
        trading_fee: TradingFee,
        amm_account,
      });
    }

    if (!response?.marker) break;
    marker = response.marker;
  }

  return pools;
}



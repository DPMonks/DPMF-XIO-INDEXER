// /src/indexer/pools.js
// Static pools include liquid XRP/RLUSD plus existing XIO pairs.
// Env: RLUSD_ISSUER, RLUSD_CURRENCY, RLUSD_CURRENCY_HEX, XRP_RLUSD_AMM_ACCOUNT, …

import { discoverXioPools } from "../../xrplClient.js";
import { logger } from "../../utils/logger.js";

const XIO_ISSUER = process.env.XIO_ISSUER;
const XIO_CURRENCY = process.env.XIO_CURRENCY || "XIO";
const XIO_CURRENCY_HEX = process.env.XIO_CURRENCY_HEX;

const RLUSD_ISSUER =
  process.env.RLUSD_ISSUER || "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_CURRENCY = process.env.RLUSD_CURRENCY || "RLUSD";
const RLUSD_CURRENCY_HEX =
  process.env.RLUSD_CURRENCY_HEX || "524C555344000000000000000000000000000000";
const RLUSD_LP_HEX = process.env.RLUSD_LP_CURRENCY_HEX;
const RLUSD_LP_ISSUER = process.env.RLUSD_LP_ISSUER;

const XRP_XIO_AMM = process.env.AMM_ACCOUNT; // verified AMM pool
const RLUSD_XIO_AMM = process.env.RLUSD_AMM_ACCOUNT; // placeholder until active
const XRP_RLUSD_AMM = process.env.XRP_RLUSD_AMM_ACCOUNT || null;

const LP_ISSUER = process.env.LP_ISSUER; // verified LP issuer
const LP_CURRENCY_HEX = process.env.LP_CURRENCY_HEX; // verified LP hex

// Ledger currency for RLUSD must be hex (5-char ASCII is invalid on XRPL)
const rlusdLedgerCurrency = RLUSD_CURRENCY_HEX || RLUSD_CURRENCY;

const staticPools = [
  {
    name: "XRP/RLUSD",
    tokenA: { currency: "XRP" },
    tokenB: {
      currency: rlusdLedgerCurrency,
      currency_hex: RLUSD_CURRENCY_HEX,
      issuer: RLUSD_ISSUER,
      display: RLUSD_CURRENCY
    },
    amm_issuer: XRP_RLUSD_AMM,
    lp_currency_hex: null,
    lp_issuer: null,
    assets_in_pool: 2,
    lp_total: null,
    usd_value: null,
    liquid: true
  },
  {
    name: "XRP/XIO",
    tokenA: { currency: "XRP" },
    tokenB: { currency: XIO_CURRENCY, issuer: XIO_ISSUER },

    amm_issuer: XRP_XIO_AMM,
    lp_currency_hex: LP_CURRENCY_HEX,
    lp_issuer: LP_ISSUER,

    assets_in_pool: 2,
    lp_total: null,
    usd_value: null
  },
  {
    name: "XIO/RLUSD",
    tokenA: { currency: XIO_CURRENCY, issuer: XIO_ISSUER },
    tokenB: {
      currency: rlusdLedgerCurrency,
      currency_hex: RLUSD_CURRENCY_HEX,
      issuer: RLUSD_ISSUER,
      display: RLUSD_CURRENCY
    },

    amm_issuer: RLUSD_XIO_AMM,
    lp_currency_hex: RLUSD_LP_HEX,
    lp_issuer: RLUSD_LP_ISSUER,

    assets_in_pool: 2,
    lp_total: null,
    usd_value: null
  }
];

export async function loadDynamicXioPools() {
  logger.info("POOLS", "Discovering dynamic XIO pools…");

  const discovered = await discoverXioPools(XIO_CURRENCY, XIO_ISSUER);

  const dynamicPools = discovered.map((p) => ({
    name: `${p.asset.currency}/${p.asset2.currency}`,
    tokenA: p.asset,
    tokenB: p.asset2,

    amm_issuer: p.amm_account || null,
    lp_currency_hex: p.lp_token?.currency || null,
    lp_issuer: p.lp_token?.issuer || null,

    assets_in_pool: 2,
    lp_total: p.lp_token?.value || null,
    usd_value: null
  }));

  return [...staticPools, ...dynamicPools];
}

export default staticPools;

// /src/indexer/pools.js
import { discoverXioPools } from "../../xrplClient.js";
import { logger } from "../../utils/logger.js";

const XIO_ISSUER = process.env.XIO_ISSUER || "rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU";
const XIO_CURRENCY = process.env.XIO_CURRENCY || "XIO";
const XIO_CURRENCY_HEX =
  process.env.XIO_CURRENCY_HEX || "58494F0000000000000000000000000000000000";

const RLUSD_ISSUER =
  process.env.RLUSD_ISSUER || "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const RLUSD_CURRENCY = process.env.RLUSD_CURRENCY || "RLUSD";
const RLUSD_CURRENCY_HEX =
  process.env.RLUSD_CURRENCY_HEX || "524C555344000000000000000000000000000000";
const RLUSD_LP_HEX = process.env.RLUSD_LP_CURRENCY_HEX || "";
const RLUSD_LP_ISSUER = process.env.RLUSD_LP_ISSUER || "";

const XRP_XIO_AMM = process.env.AMM_ACCOUNT || "rPYfrbCvJGGEs9ddUtRiq58kCJBw9hoGij";
const RLUSD_XIO_AMM = process.env.RLUSD_AMM_ACCOUNT || "";
const XRP_RLUSD_AMM = process.env.XRP_RLUSD_AMM_ACCOUNT || null;
const XIO_XDX_AMM = process.env.XIO_XDX_AMM_ACCOUNT || "rDJXzsZGACeHGJQYfaudsYshaC5zJxqsHr";

const LP_ISSUER = process.env.LP_ISSUER || XRP_XIO_AMM;
const LP_CURRENCY_HEX =
  process.env.LP_CURRENCY_HEX || "030AE7B410D0ECF1DEC886D216866C31C898C875";
const XIO_XDX_LP_HEX =
  process.env.XIO_XDX_LP_HEX || "03E7A465A6E95CDA21E1110056AA51A71FA55CB9";

const XDX_ISSUER = process.env.XDX_ISSUER || "rMJAXYsbNzhwp7FfYnAsYP5ty3R9XnurPo";
const XDX_CURRENCY_HEX =
  process.env.XDX_CURRENCY_HEX || "5844580000000000000000000000000000000000";

const rlusdLedgerCurrency = RLUSD_CURRENCY_HEX || RLUSD_CURRENCY;

const staticPools = [
  {
    name: "XRP/RLUSD",
    tokenA: { currency: "XRP" },
    tokenB: {
      currency: rlusdLedgerCurrency,
      currency_hex: RLUSD_CURRENCY_HEX,
      issuer: RLUSD_ISSUER,
      display: RLUSD_CURRENCY,
    },
    amm_issuer: XRP_RLUSD_AMM,
    lp_currency_hex: null,
    lp_issuer: null,
    assets_in_pool: 2,
    lp_total: null,
    usd_value: null,
    liquid: true,
  },
  {
    name: "XRP/XIO",
    tokenA: { currency: "XRP" },
    tokenB: { currency: XIO_CURRENCY, currency_hex: XIO_CURRENCY_HEX, issuer: XIO_ISSUER },
    amm_issuer: XRP_XIO_AMM,
    lp_currency_hex: LP_CURRENCY_HEX,
    lp_issuer: LP_ISSUER === XIO_ISSUER ? XRP_XIO_AMM : LP_ISSUER || XRP_XIO_AMM,
    assets_in_pool: 2,
    lp_total: null,
    usd_value: null,
  },
  {
    name: "XIO/XDX",
    tokenA: { currency: XIO_CURRENCY, currency_hex: XIO_CURRENCY_HEX, issuer: XIO_ISSUER },
    tokenB: { currency: "XDX", currency_hex: XDX_CURRENCY_HEX, issuer: XDX_ISSUER },
    amm_issuer: XIO_XDX_AMM,
    lp_currency_hex: XIO_XDX_LP_HEX,
    lp_issuer: XIO_XDX_AMM,
    assets_in_pool: 2,
    lp_total: null,
    usd_value: null,
  },
];

if (RLUSD_XIO_AMM) {
  staticPools.push({
    name: "XIO/RLUSD",
    tokenA: { currency: XIO_CURRENCY, currency_hex: XIO_CURRENCY_HEX, issuer: XIO_ISSUER },
    tokenB: {
      currency: rlusdLedgerCurrency,
      currency_hex: RLUSD_CURRENCY_HEX,
      issuer: RLUSD_ISSUER,
      display: RLUSD_CURRENCY,
    },
    amm_issuer: RLUSD_XIO_AMM,
    lp_currency_hex: RLUSD_LP_HEX || null,
    lp_issuer: RLUSD_LP_ISSUER || RLUSD_XIO_AMM,
    assets_in_pool: 2,
    lp_total: null,
    usd_value: null,
  });
}

export async function loadDynamicXioPools() {
  logger.info("POOLS", "Discovering dynamic XIO pools…");
  try {
    const discovered = await discoverXioPools(XIO_CURRENCY, XIO_ISSUER);
    const dynamicPools = discovered.map((p) => ({
      name: `${p.asset.currency}/${p.asset2.currency}`,
      tokenA: p.asset,
      tokenB: p.asset2,
      amm_issuer: p.amm_account || null,
      lp_currency_hex: p.lp_token?.currency || null,
      lp_issuer: p.lp_token?.issuer || p.amm_account || null,
      assets_in_pool: 2,
      lp_total: p.lp_token?.value || null,
      usd_value: null,
    }));
    return [...staticPools, ...dynamicPools];
  } catch (err) {
    logger.warn("POOLS", `Dynamic pool discovery failed: ${err?.message || err}`);
    return [...staticPools];
  }
}

export default staticPools;

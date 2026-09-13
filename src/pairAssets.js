// Shared XRPL asset helpers for liquid pairs (XRP / RLUSD / XIO)
import { config } from "../config.js";

const RLUSD_ISSUER = process.env.RLUSD_ISSUER || config.rlusdIssuer;
const RLUSD_HEX = process.env.RLUSD_CURRENCY_HEX || config.rlusdCurrencyHex;
const RLUSD_ASCII = process.env.RLUSD_CURRENCY || config.rlusdCurrency || "RLUSD";

const XIO_ISSUER = process.env.XIO_ISSUER || config.xioIssuer;
const XIO_ASCII = process.env.XIO_CURRENCY || "XIO";
const XIO_HEX = process.env.XIO_CURRENCY_HEX || config.xioCurrency;

/** Prefer 40-char hex for non-standard currency codes (RLUSD is 5 chars). */
export function ledgerCurrency(asciiOrHex, hexFallback) {
  if (!asciiOrHex && hexFallback) return hexFallback;
  const c = String(asciiOrHex || "");
  if (c.length === 40 && /^[0-9A-Fa-f]+$/.test(c)) return c.toUpperCase();
  if (c.length === 3) return c;
  if (hexFallback) return hexFallback;
  return Buffer.from(c, "utf8")
    .toString("hex")
    .toUpperCase()
    .padEnd(40, "0")
    .slice(0, 40);
}

export function xrplAsset(token) {
  if (!token || token.currency === "XRP") return { currency: "XRP" };
  const cur = ledgerCurrency(token.currency, token.currency_hex);
  return { currency: cur, issuer: token.issuer };
}

export function parseAmount(raw) {
  if (raw == null) return 0;
  if (typeof raw === "object") return Number(raw.value || 0);
  const n = Number(raw);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

/**
 * Canonical watch-pair definitions used by book + AMM scanners + API.
 * Names match AIM AIM_WATCH_PAIRS style: XIO/RLUSD, XIO/XRP, XRP/RLUSD, XIO/XDX.
 */
export function getWatchPairDefs(names) {
  const rlusd = {
    currency: RLUSD_ASCII,
    currency_hex: RLUSD_HEX,
    issuer: RLUSD_ISSUER
  };
  const xio = {
    currency: XIO_ASCII,
    currency_hex: XIO_HEX,
    issuer: XIO_ISSUER
  };
  const xrp = { currency: "XRP" };

  const catalog = {
    "XRP/RLUSD": {
      name: "XRP/RLUSD",
      tokenA: xrp,
      tokenB: rlusd,
      amm_issuer: process.env.XRP_RLUSD_AMM_ACCOUNT || null,
      liquid: true
    },
    "XIO/XRP": {
      name: "XIO/XRP",
      tokenA: xio,
      tokenB: xrp,
      aliasOf: "XRP/XIO",
      amm_issuer: process.env.AMM_ACCOUNT || null,
      liquid: true
    },
    "XRP/XIO": {
      name: "XRP/XIO",
      tokenA: xrp,
      tokenB: xio,
      amm_issuer: process.env.AMM_ACCOUNT || null,
      liquid: true
    },
    "XIO/RLUSD": {
      name: "XIO/RLUSD",
      tokenA: xio,
      tokenB: rlusd,
      amm_issuer: process.env.RLUSD_AMM_ACCOUNT || null,
      liquid: true
    },
    "XIO/XDX": {
      name: "XIO/XDX",
      tokenA: xio,
      tokenB: {
        currency: process.env.XIO_CURRENCY || "XIO",
        currency_hex: process.env.XIO_CURRENCY_HEX || null,
        issuer: process.env.XIO_ISSUER || "rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU"
      },
      amm_issuer: process.env.XIO_XDX_AMM_ACCOUNT || process.env.XIO_AMM_ACCOUNT || "rDJXzsZGACeHGJQYfaudsYshaC5zJxqsHr",
      liquid: true
    }
  };

  const list = (names && names.length ? names : config.watchPairs) || [
    "XRP/RLUSD",
    "XIO/XRP",
    "XIO/RLUSD",
    "XIO/XDX"
  ];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const key = String(raw).trim().toUpperCase().replace(/\s+/g, "");
    const match = Object.keys(catalog).find(
      (k) => k.toUpperCase().replace(/\s+/g, "") === key
    );
    if (!match || seen.has(match)) continue;
    seen.add(match);
    out.push({ ...catalog[match] });
  }
  if (!seen.has("XRP/RLUSD")) out.unshift({ ...catalog["XRP/RLUSD"] });
  return out;
}

export function pairKey(base, quote) {
  return `${String(base).toUpperCase()}/${String(quote).toUpperCase()}`;
}

export function findPairDef(base, quote) {
  const key = pairKey(base, quote);
  const rev = pairKey(quote, base);
  const defs = getWatchPairDefs([key, rev, ...(config.watchPairs || [])]);
  return (
    defs.find((d) => d.name.toUpperCase() === key) ||
    defs.find((d) => d.name.toUpperCase() === rev) ||
    null
  );
}

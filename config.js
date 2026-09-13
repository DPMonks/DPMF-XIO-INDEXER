// XIO indexer config (TEST fork — do not point at XDX production DB)
// Env knobs:
//   XIO_ISSUER, XIO_CURRENCY, XIO_CURRENCY_HEX
//   RLUSD_ISSUER, RLUSD_CURRENCY, RLUSD_CURRENCY_HEX
//   AMM_ACCOUNT (= XIO/XRP), XIO_XDX_AMM_ACCOUNT
//   LP_ISSUER, LP_CURRENCY_HEX
//   WATCH_PAIRS=XIO/XRP,XIO/XDX,XRP/RLUSD
//   BOOK_SYNC_INTERVAL_MS, BOOK_DEPTH
export const config = {
  xrplWs: process.env.XRPL_WS || "wss://xrpl.ws",
  xrplRpc: process.env.XRPL_RPC || "https://xrpl.ws",

  // XIO Token Details (Fuzion issuer)
  xioIssuer: process.env.XIO_ISSUER || "rfuzioNFTKArnU1PQD5BEF272vpbHMRoxU",
  xioCurrency: process.env.XIO_CURRENCY_HEX || "58494F0000000000000000000000000000000000",
  lpCurrency: process.env.LP_CURRENCY_HEX || "030AE7B410D0ECF1DEC886D216866C31C898C875",

  // Quote sibling
  xdxIssuer: process.env.XDX_ISSUER || "rMJAXYsbNzhwp7FfYnAsYP5ty3R9XnurPo",
  xdxCurrency: process.env.XDX_CURRENCY_HEX || "5844580000000000000000000000000000000000",

  rlusdIssuer: process.env.RLUSD_ISSUER || "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  rlusdCurrency: process.env.RLUSD_CURRENCY || "RLUSD",
  rlusdCurrencyHex:
    process.env.RLUSD_CURRENCY_HEX || "524C555344000000000000000000000000000000",

  ammAccount: process.env.AMM_ACCOUNT || "rPYfrbCvJGGEs9ddUtRiq58kCJBw9hoGij",
  xioXdxAmmAccount: process.env.XIO_XDX_AMM_ACCOUNT || "rDJXzsZGACeHGJQYfaudsYshaC5zJxqsHr",

  watchPairs: String(process.env.WATCH_PAIRS || "XIO/XRP,XIO/XDX,XRP/RLUSD")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || "dpmf_xio_indexer_test",
    port: process.env.PGPORT
  },

  ammSyncInterval: 60000,
  holdersSyncInterval: 120000,
  lpSyncInterval: 120000,
  bookSyncInterval: Number(process.env.BOOK_SYNC_INTERVAL_MS) || 30000,
  bookDepth: Number(process.env.BOOK_DEPTH) || 20
};

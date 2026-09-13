// debugXioTrustlines.js
// Debug: scan RippleState via ledger_data using issuer + HEX currency

import { Client } from "xrpl";

const XIO_ISSUER = process.env.XIO_ISSUER;
const XIO_CURRENCY_HEX = process.env.XIO_CURRENCY_HEX;

async function main() {
  const client = new Client("wss://xrpl.ws");
  await client.connect();

  const res = await client.request({
    command: "ledger_data",
    ledger_index: "validated",
    type: "state",
    limit: 2000
  });

  const states = res.result.state || [];

  const xioLines = states.filter((obj) => {
    if (obj.LedgerEntryType !== "RippleState") return false;

    const low = obj.LowLimit;
    const high = obj.HighLimit;

    const isLowXio =
      low.issuer === XIO_ISSUER && low.currency === XIO_CURRENCY_HEX;
    const isHighXio =
      high.issuer === XIO_ISSUER && high.currency === XIO_CURRENCY_HEX;

    return isLowXio || isHighXio;
  });

  console.log("XIO RippleState entries:", xioLines.length);
  console.log(xioLines.slice(0, 5));

  await client.disconnect();
}

main().catch(console.error);

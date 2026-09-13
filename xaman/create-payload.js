// src/xaman/create-payload.js
// Backend payload creator for Xaman SignIn

import fetch from "node-fetch";

export async function createPayloadBackend(req, res) {
  try {
    const response = await fetch("https://xumm.app/api/v1/platform/payload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.XUMM_API_KEY,
        "X-API-Secret": process.env.XUMM_API_SECRET
      },
      body: JSON.stringify({
        txjson: {
          TransactionType: "SignIn"
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ Xaman backend error:", text);
      return res.status(500).json({ error: "Failed to create payload" });
    }

    const payload = await response.json();

    console.log("📦 INDEXER PAYLOAD CREATED:");
    console.log(JSON.stringify(payload, null, 2));

    return res.json(payload);

  } catch (err) {
    console.error("❌ createPayloadBackend error:", err);
    return res.status(500).json({ error: "Payload creation failed" });
  }
}

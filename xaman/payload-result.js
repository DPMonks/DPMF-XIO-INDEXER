// src/xaman/payload-result.js
// Backend payload result fetcher

import fetch from "node-fetch";

export default async function payloadResult(req, res) {
  try {
    const { uuid } = req.query;

    if (!uuid) {
      return res.status(400).json({ error: "Missing UUID" });
    }

    const response = await fetch(
      `https://xumm.app/api/v1/platform/payload/${uuid}`,
      {
        headers: {
          "X-API-Key": process.env.XUMM_API_KEY,
          "X-API-Secret": process.env.XUMM_API_SECRET
        }
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ Xaman result error:", text);
      return res.status(500).json({ error: "Failed to fetch payload result" });
    }

    const result = await response.json();
    return res.json(result);

  } catch (err) {
    console.error("❌ payloadResult error:", err);
    return res.status(500).json({ error: "Payload result failed" });
  }
}

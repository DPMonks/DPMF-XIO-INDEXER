// src/routes/xaman.js

import 'dotenv/config';
import express from "express";
import { XummSdk } from "xumm-sdk";

const router = express.Router();

// ------------------------------------------------------
// INITIALISE XAMAN SDK (correct positional arguments)
// ------------------------------------------------------
const xumm = new XummSdk(
  process.env.XUMM_API_KEY,
  process.env.XUMM_API_SECRET
);

// ------------------------------------------------------
// CREATE SIGN-IN PAYLOAD
// ------------------------------------------------------
router.post("/create-payload", async (req, res) => {
  try {
    const payload = await xumm.payload.create({
      txjson: {
        TransactionType: "SignIn"
      }
    });

    res.json({
      refs: payload.refs,
      uuid: payload.uuid,
      websocket: payload.websocket_url // required for Xaman live session
    });
  } catch (error) {
    console.error("XAMAN payload error:", error);
    res.status(500).json({ error: "Failed to create payload" });
  }
});

export default router;


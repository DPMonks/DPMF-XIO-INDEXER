// dbWriter.js — FULLY FIXED

import { pool } from "./db.js";

/* ------------------------------------------------------
   ENSURE REQUIRED TABLES EXIST
------------------------------------------------------ */
async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS xio_accounts (
        account TEXT PRIMARY KEY
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_holders_latest (
        id SERIAL PRIMARY KEY,
        account TEXT,
        balance NUMERIC,
        frozen BOOLEAN DEFAULT FALSE,
        closed BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'active',
        updated_at TIMESTAMP DEFAULT NOW(),
        download_link TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_holders_history (
        id SERIAL PRIMARY KEY,
        account TEXT,
        balance NUMERIC,
        trust_limit NUMERIC,
        frozen BOOLEAN DEFAULT FALSE,
        closed BOOLEAN DEFAULT FALSE,
        status TEXT DEFAULT 'active',
        updated_at TIMESTAMP DEFAULT NOW(),
        download_link TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lp_holders_latest (
        id SERIAL PRIMARY KEY,
        pool_name TEXT,
        account TEXT,
        lp_balance NUMERIC,
        timestamp TIMESTAMP DEFAULT NOW(),
        lp_currency_hex TEXT,
        lp_issuer TEXT,
        download_link TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lp_holders_history_daily (
        day DATE,
        pool_name TEXT,
        lp_holder_count INTEGER,
        PRIMARY KEY (day, pool_name)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS amm_pool_snapshots (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW(),
        pool_name TEXT,
        amountA NUMERIC,
        amountB NUMERIC,
        price NUMERIC,
        lp_supply NUMERIC,
        assets_in_pool INTEGER,
        usd_value NUMERIC
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tvl_history (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW(),
        tvl NUMERIC
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_metrics_latest (
        market_cap NUMERIC,
        fdv NUMERIC,
        circulating NUMERIC,
        total_supply NUMERIC,
        holders INTEGER,
        trustlines INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS token_activity_history (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW(),
        price NUMERIC,
        volume NUMERIC,
        marketcap NUMERIC,
        rank INTEGER,
        traders INTEGER,
        holders INTEGER
      );
    `);


    await pool.query(`
      CREATE TABLE IF NOT EXISTS book_snapshots (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW(),
        pair_name TEXT NOT NULL,
        bid NUMERIC,
        ask NUMERIC,
        mid NUMERIC,
        spread NUMERIC,
        spread_bps NUMERIC,
        bid_depth_base NUMERIC,
        ask_depth_base NUMERIC,
        bid_depth_quote NUMERIC,
        ask_depth_quote NUMERIC,
        bid_count INTEGER,
        ask_count INTEGER,
        bids JSONB,
        asks JSONB
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_book_snapshots_pair_ts
      ON book_snapshots (pair_name, timestamp DESC);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pair_marks_latest (
        pair_name TEXT PRIMARY KEY,
        bid NUMERIC,
        ask NUMERIC,
        mid NUMERIC,
        spread_bps NUMERIC,
        bid_depth_base NUMERIC,
        ask_depth_base NUMERIC,
        amm_price NUMERIC,
        amm_account TEXT,
        amm_amount_a NUMERIC,
        amm_amount_b NUMERIC,
        liquid BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("[DB] Verified required tables exist");
  } catch (err) {
    console.error("[DB] Failed to ensure tables exist", err);
  }
}

ensureTables();

/* ------------------------------------------------------
   WRITE TOKEN HOLDERS (LATEST SNAPSHOT)
------------------------------------------------------ */
export async function writeTokenHolders(holders) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE token_holders_latest RESTART IDENTITY CASCADE");

    for (const h of holders) {
      await client.query(
        `INSERT INTO token_holders_latest
         (account, balance, frozen, closed, status, updated_at, download_link)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [
          h.account,
          h.balance,
          h.frozen ?? false,
          h.closed ?? false,
          h.status ?? "active",
          h.download_link ?? null
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[DB][WRITE TOKEN HOLDERS ERROR]", err);
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------
   WRITE TOKEN HOLDERS HISTORY
------------------------------------------------------ */
export async function writeTokenHoldersHistory(history) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const h of history) {
      await client.query(
        `INSERT INTO token_holders_history
         (account, balance, trust_limit, frozen, closed, status, updated_at, download_link)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
        [
          h.account,
          h.balance ?? 0,
          h.trust_limit ?? 0,
          h.frozen ?? false,
          h.closed ?? false,
          h.status ?? "active",
          h.download_link ?? null
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[DB][WRITE TOKEN HOLDERS HISTORY ERROR]", err);
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------
   WRITE LP HOLDERS
------------------------------------------------------ */
export async function writeLpHolders(poolName, holders) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM lp_holders_latest WHERE pool_name = $1`,
      [poolName]
    );

    for (const h of holders) {
      await client.query(
        `INSERT INTO lp_holders_latest
         (pool_name, account, lp_balance, timestamp, lp_currency_hex, lp_issuer, download_link)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
        [
          poolName,
          h.account,
          h.balance,
          h.lp_currency_hex,
          h.lp_issuer,
          h.download_link ?? null
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[DB][WRITE LP HOLDERS ERROR]", err);
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------
   LP HISTORY DAILY
------------------------------------------------------ */
export async function writeLpHoldersHistory(poolName, holders) {
  try {
    await pool.query(
      `INSERT INTO lp_holders_history_daily (day, pool_name, lp_holder_count)
       VALUES (CURRENT_DATE, $1, $2)
       ON CONFLICT (day, pool_name)
       DO UPDATE SET lp_holder_count = EXCLUDED.lp_holder_count`,
      [poolName, holders.length]
    );
  } catch (err) {
    console.error("[DB][WRITE LP HISTORY ERROR]", err);
    throw err;
  }
}

/* ------------------------------------------------------
   AMM SNAPSHOTS
------------------------------------------------------ */
export async function writeAmmSnapshot(poolName, amm) {
  try {
    await pool.query(
      `INSERT INTO amm_pool_snapshots
        (timestamp, pool_name, amountA, amountB, price, lp_supply, assets_in_pool, usd_value)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7)`,
      [
        poolName,
        amm.amountA,
        amm.amountB,
        amm.price,
        amm.lpSupply,
        amm.assets_in_pool ?? 2,
        amm.usdValue ?? null
      ]
    );
  } catch (err) {
    console.error("[DB][WRITE AMM SNAPSHOT ERROR]", err);
    throw err;
  }
}

/* ------------------------------------------------------
   TVL HISTORY
------------------------------------------------------ */
export async function writeTvlHistory(tvl) {
  try {
    await pool.query(
      `INSERT INTO tvl_history (timestamp, tvl)
       VALUES (NOW(), $1)`,
      [tvl]
    );
  } catch (err) {
    console.error("[DB][WRITE TVL HISTORY ERROR]", err);
    throw err;
  }
}

/* ------------------------------------------------------
   TOKEN METRICS
------------------------------------------------------ */
export async function writeTokenMetrics({
  marketCap,
  fdv,
  circulating,
  totalSupply,
  holders,
  trustlines
}) {
  try {
    await pool.query(
      `INSERT INTO token_metrics_latest
        (market_cap, fdv, circulating, total_supply, holders, trustlines, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [marketCap, fdv, circulating, totalSupply, holders, trustlines]
    );
  } catch (err) {
    console.error("[DB][WRITE TOKEN METRICS ERROR]", err);
    throw err;
  }
}

/* ------------------------------------------------------
   ACTIVITY HISTORY
------------------------------------------------------ */
export async function writeActivityHistory({
  price,
  volume,
  marketcap,
  rank,
  traders,
  holders
}) {
  try {
    await pool.query(
      `INSERT INTO token_activity_history
        (timestamp, price, volume, marketcap, rank, traders, holders)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
      [
        price ?? 0,
        volume ?? 0,
        marketcap ?? 0,
        rank ?? 0,
        traders ?? 0,
        holders ?? 0
      ]
    );
  } catch (err) {
    console.error("[DB][WRITE ACTIVITY HISTORY ERROR]", err);
    throw err;
  }
}


/* ------------------------------------------------------
   BOOK SNAPSHOTS (liquid pairs e.g. XRP/RLUSD)
------------------------------------------------------ */
export async function writeBookSnapshot(book) {
  try {
    await pool.query(
      `INSERT INTO book_snapshots
        (timestamp, pair_name, bid, ask, mid, spread, spread_bps,
         bid_depth_base, ask_depth_base, bid_depth_quote, ask_depth_quote,
         bid_count, ask_count, bids, asks)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)`,
      [
        book.pair,
        book.bid,
        book.ask,
        book.mid,
        book.spread,
        book.spread_bps,
        book.bid_depth_base,
        book.ask_depth_base,
        book.bid_depth_quote,
        book.ask_depth_quote,
        book.bid_count,
        book.ask_count,
        JSON.stringify(book.bids || []),
        JSON.stringify(book.asks || [])
      ]
    );
  } catch (err) {
    console.error("[DB][WRITE BOOK SNAPSHOT ERROR]", err);
    throw err;
  }
}

/* ------------------------------------------------------
   PAIR MARKS LATEST (agents / dashboard)
------------------------------------------------------ */
export async function writePairMark(mark) {
  try {
    await pool.query(
      `INSERT INTO pair_marks_latest
        (pair_name, bid, ask, mid, spread_bps, bid_depth_base, ask_depth_base,
         amm_price, amm_account, amm_amount_a, amm_amount_b, liquid, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (pair_name) DO UPDATE SET
         bid = EXCLUDED.bid,
         ask = EXCLUDED.ask,
         mid = EXCLUDED.mid,
         spread_bps = EXCLUDED.spread_bps,
         bid_depth_base = EXCLUDED.bid_depth_base,
         ask_depth_base = EXCLUDED.ask_depth_base,
         amm_price = EXCLUDED.amm_price,
         amm_account = EXCLUDED.amm_account,
         amm_amount_a = EXCLUDED.amm_amount_a,
         amm_amount_b = EXCLUDED.amm_amount_b,
         liquid = EXCLUDED.liquid,
         updated_at = NOW()`,
      [
        mark.pair,
        mark.bid,
        mark.ask,
        mark.mid,
        mark.spread_bps,
        mark.bid_depth_base,
        mark.ask_depth_base,
        mark.amm_price,
        mark.amm_account,
        mark.amm_amount_a,
        mark.amm_amount_b,
        mark.liquid !== false
      ]
    );
  } catch (err) {
    console.error("[DB][WRITE PAIR MARK ERROR]", err);
    throw err;
  }
}

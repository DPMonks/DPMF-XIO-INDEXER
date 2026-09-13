const API_BASE = "https://dpmf-xio-indexer-TEST.up.railway.app/api";

// -----------------------------
// EXISTING FUNCTIONS (kept)
// -----------------------------
export async function getTVL() {
  const res = await fetch(`${API_BASE}/overview`);
  const data = await res.json();
  return data.tvl;
}

export async function getHolders() {
  const res = await fetch(`${API_BASE}/overview`);
  const data = await res.json();
  return data.holder_count;
}

export async function getAMM() {
  const res = await fetch(`${API_BASE}/amm`);
  return res.json();
}

// -----------------------------
// UPDATED FULL API CLIENT
// -----------------------------
export const api = {
  overview: () => fetch(`${API_BASE}/overview`).then(r => r.json()),
  amm: () => fetch(`${API_BASE}/amm`).then(r => r.json()),
  pools: () => fetch(`${API_BASE}/pools`).then(r => r.json()),
  pairs: () => fetch(`${API_BASE}/pairs`).then(r => r.json()),
  book: (base, quote, live = false) =>
    fetch(`${API_BASE}/book/${base}/${quote}${live ? "?live=1" : ""}`).then(r => r.json()),
  ammPair: (base, quote, live = false) =>
    fetch(`${API_BASE}/amm/${base}/${quote}${live ? "?live=1" : ""}`).then(r => r.json()),

  // TOKEN HOLDERS (sorted + ranked)
  topHolders: async (limit = 100) => {
    const data = await fetch(`${API_BASE}/top-holders?limit=${limit}`).then(r => r.json());

    // Ensure numeric sorting
    const sorted = data.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

    // Add rank numbers
    return sorted.map((holder, index) => ({
      ...holder,
      rank: index + 1
    }));
  },

  // LP HOLDERS (sorted + ranked)
  topLp: async (limit = 100) => {
    const data = await fetch(`${API_BASE}/top-lp?limit=${limit}`).then(r => r.json());

    const sorted = data.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

    return sorted.map((holder, index) => ({
      ...holder,
      rank: index + 1
    }));
  },

  tvlHistory: () =>
    fetch(`${API_BASE}/charts/tvl`).then(r => r.json()),

  holdersHistory: () =>
    fetch(`${API_BASE}/charts/holders`).then(r => r.json()),

  lpHoldersHistory: () =>
    fetch(`${API_BASE}/charts/lp-holders`).then(r => r.json())
};

import tokenDetailsStatic from "./token-details-static.js";
import tokenDetailsLive from "./token-details-live.js";

export default async function tokenDetails(req, res) {
  try {
    // Call static handler as a function
    const staticData = await tokenDetailsStatic(req, {
      json: (d) => d
    });

    // Call live handler as a function
    const liveData = await tokenDetailsLive(req, {
      json: (d) => d
    });

    // Merge both datasets
    const final = { ...staticData, ...liveData };

    res.json(final);

  } catch (err) {
    console.error("[API][TOKEN DETAILS COMBINED ERROR]", err);
    res.status(500).json({
      error: err?.message || "Failed to fetch combined token details"
    });
  }
}

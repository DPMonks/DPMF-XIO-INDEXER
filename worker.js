export default {
  async fetch(request) {
    try {
      // Full‑history XRPL node (AMM + LP + metrics)
      const target = process.env.XRPL_FULL_HISTORY_WS || "https://s2.ripple.com:51234";

      // Read incoming JSON body from your indexer
      const reqBody = await request.text();

      // Forward the request to XRPL full‑history node
      const upstream = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: reqBody
      });

      // Read upstream response
      const text = await upstream.text();

      // Return XRPL response unchanged
      return new Response(text, {
        status: upstream.status,
        headers: {
          "Content-Type": "application/json"
        }
      });

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500 }
      );
    }
  }
};

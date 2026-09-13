const TOKEN_TYPE = "Digital Asset";
const ISSUER_FEE = 0; // 0% issuer fee
const BLACKHOLED = true;
const CREATED = "2021-01-01"; // adjust to exact issuance date if needed

export default async function tokenDetailsStatic(req, res) {
  try {
    const response = {
      tokenType: TOKEN_TYPE,
      issuerFee: `${ISSUER_FEE}%`,
      blackholed: BLACKHOLED,
      created: CREATED
    };

    if (res?.json) return res.json(response);
    return response;
  } catch (err) {
    console.error("[API][STATIC TOKEN DETAILS ERROR]", err);
    if (res?.json) return res.status(500).json({ error: "Failed to fetch static token details" });
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    const BRIDGE_CA =
      (process.env.BRIDGE_CA ||
        "0x8B21106E95634B69433CB96dA93fc703D5bDba64").toLowerCase();

    const KEY = process.env.ETHERSCAN_API_KEY;

    if (!KEY) {
      return res.status(400).json({ error: "Missing ETHERSCAN_API_KEY in Vercel env" });
    }

    // Ethereum Mainnet chainId = 1
    const chainid = 1;

    // Etherscan API V2 base
    const base = "https://api.etherscan.io/v2/api";

    // Normal txs
    const normalUrl =
      `${base}?chainid=${chainid}` +
      `&module=account&action=txlist` +
      `&address=${BRIDGE_CA}` +
      `&startblock=0&endblock=99999999&sort=desc` +
      `&apikey=${KEY}`;

    // Internal txs (very important for bridges)
    const internalUrl =
      `${base}?chainid=${chainid}` +
      `&module=account&action=txlistinternal` +
      `&address=${BRIDGE_CA}` +
      `&startblock=0&endblock=99999999&sort=desc` +
      `&apikey=${KEY}`;

    const [normalRes, internalRes] = await Promise.all([
      fetch(normalUrl),
      fetch(internalUrl),
    ]);

    const normalData = await normalRes.json();
    const internalData = await internalRes.json();

    return res.status(200).json({
      normal: normalData,
      internal: internalData,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

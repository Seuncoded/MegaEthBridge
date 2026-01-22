export default async function handler(req, res) {
  try {
    const BRIDGE_CA =
      process.env.BRIDGE_CA ||
      "0x8B21106E95634B69433CB96dA93fc703D5bDba64";

    const KEY = process.env.ETHERSCAN_API_KEY;

    if (!KEY) {
      return res.status(400).json({ error: "Missing ETHERSCAN_API_KEY in Vercel env" });
    }

    const url =
      `https://api.etherscan.io/api?module=account&action=txlist` +
      `&address=${BRIDGE_CA}` +
      `&startblock=0&endblock=99999999&sort=desc&apikey=${KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    // return raw etherscan response so frontend can use it
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

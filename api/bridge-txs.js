export default async function handler(req, res) {
  try {
    const BRIDGE_CA =
      (process.env.BRIDGE_CA ||
        "0x8B21106E95634B69433CB96dA93fc703D5bDba64").toLowerCase();

    const KEY = process.env.ETHERSCAN_API_KEY;
    if (!KEY) return res.status(400).json({ error: "Missing ETHERSCAN_API_KEY" });

    const chainid = 1;
    const base = "https://api.etherscan.io/v2/api";

    const fetchPaged = async (action, maxPages = 20, offset = 100) => {
      let all = [];

      for (let page = 1; page <= maxPages; page++) {
        const url =
          `${base}?chainid=${chainid}` +
          `&module=account&action=${action}` +
          `&address=${BRIDGE_CA}` +
          `&page=${page}&offset=${offset}&sort=desc` +
          `&apikey=${KEY}`;

        const r = await fetch(url);
        const data = await r.json();

        if (data.status !== "1") break;

        const batch = data.result || [];
        all.push(...batch);

        if (batch.length < offset) break; // no more pages
      }

      return all;
    };

    const normal = await fetchPaged("txlist", 50, 100); // up to 5,000
    const internal = await fetchPaged("txlistinternal", 50, 100); // optional

    return res.status(200).json({
      status: "1",
      message: "OK",
      result: {
        normalCount: normal.length,
        internalCount: internal.length,
        normal,
        internal,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

const BRIDGE_CA = "0x8B21106E95634B69433CB96dA93fc703D5bDba64";

const API_URL =
  location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? "https://mega-eth-bridge.vercel.app/api/bridge-txs"
    : "/api/bridge-txs";

let autoRefresh = true;
let txs = [];

const $ = (id) => document.getElementById(id);

function shortAddr(a) {
  if (!a) return "";
  return a.slice(0, 6) + "..." + a.slice(-4);
}

function fmtTime(ts) {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString();
}

function weiToEth(weiStr) {
  try {
    const wei = BigInt(weiStr || "0");
    const eth = Number(wei) / 1e18;
    return eth;
  } catch {
    return 0;
  }
}

function ethToUSDC(eth, ethPrice = 3000) {
  return eth * ethPrice;
}

function fmtUSDC(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function showError(msg) {
  const box = $("errorBox");
  if (!msg) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.classList.remove("hidden");
  box.textContent = msg;
}

async function fetchBridgeTxs() {
  showError(null);

  const res = await fetch(API_URL, { cache: "no-store" });
  const data = await res.json();

  if (!res.ok) throw new Error(data?.error || "API failed");

  // API returns:
  // { status:"1", message:"OK", result:{ normal:[...], internal:[...] } }
  const normal = data?.result?.normal || [];
  const internal = data?.result?.internal || [];

  // merge & dedupe by hash
  const map = new Map();
  [...normal, ...internal].forEach((t) => {
    if (t?.hash) map.set(t.hash, t);
  });

  return Array.from(map.values());
}

function buildStats(allTxs) {
  const ca = BRIDGE_CA.toLowerCase();

  const inTxs = allTxs.filter(
    (t) => (t.to || "").toLowerCase() === ca && BigInt(t.value || "0") > 0n
  );

  const outTxs = allTxs.filter(
    (t) => (t.from || "").toLowerCase() === ca && BigInt(t.value || "0") > 0n
  );

  const inTotalEth = inTxs.reduce((acc, t) => acc + weiToEth(t.value), 0);
  const outTotalEth = outTxs.reduce((acc, t) => acc + weiToEth(t.value), 0);

  // ETH price (simple static for now)
  const ETH_PRICE = 3000;

  const inTotalUSDC = ethToUSDC(inTotalEth, ETH_PRICE);
  const outTotalUSDC = ethToUSDC(outTotalEth, ETH_PRICE);

  // unique bridgers (people sending ETH in)
  const unique = new Set(inTxs.map((t) => (t.from || "").toLowerCase())).size;

  // 24h volume IN
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  const in24hEth = inTxs
    .filter((t) => Number(t.timeStamp) >= dayAgo)
    .reduce((acc, t) => acc + weiToEth(t.value), 0);

  const in24hUSDC = ethToUSDC(in24hEth, ETH_PRICE);

  return {
    inTxs,
    outTxs,
    inTotalUSDC,
    outTotalUSDC,
    inCount: inTxs.length,
    outCount: outTxs.length,
    unique,
    totalInTxs: inTxs.length,
    volume24hUSDC: in24hUSDC,
    ethPrice: ETH_PRICE,
  };
}

function renderLeaderboard(inTxs) {
  // group by wallet
  const byWallet = new Map();

  for (const t of inTxs) {
    const w = (t.from || "").toLowerCase();
    const amtEth = weiToEth(t.value);
    if (!byWallet.has(w)) {
      byWallet.set(w, { wallet: w, totalEth: 0, deposits: 0, last: 0 });
    }
    const obj = byWallet.get(w);
    obj.totalEth += amtEth;
    obj.deposits += 1;
    obj.last = Math.max(obj.last, Number(t.timeStamp || 0));
  }

  const ETH_PRICE = 3000;

  const rows = Array.from(byWallet.values())
    .sort((a, b) => b.totalEth - a.totalEth)
    .slice(0, 50);

  const tbody = $("leaderboardBody");
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No bridge data available</td></tr>`;
    return;
  }

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${shortAddr(r.wallet)}</td>
      <td>${fmtUSDC(ethToUSDC(r.totalEth, ETH_PRICE))}</td>
      <td>${r.deposits}</td>
      <td>${new Date(r.last * 1000).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderRecent(allTxs) {
  const ca = BRIDGE_CA.toLowerCase();

  const filtered = allTxs
    .filter((t) => BigInt(t.value || "0") > 0n)
    .sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp))
    .slice(0, 8);

  const box = $("recentBox");
  box.innerHTML = "";

  if (!filtered.length) {
    box.innerHTML = `<div class="recent-empty">No recent activity</div>`;
    return;
  }

  const ETH_PRICE = 3000;

  filtered.forEach((t) => {
    const isIn = (t.to || "").toLowerCase() === ca;
    const eth = weiToEth(t.value);
    const usd = ethToUSDC(eth, ETH_PRICE);

    const wallet = isIn ? t.from : t.to;

    const div = document.createElement("div");
    div.className = "activity";
    div.innerHTML = `
      <div class="activity-top">
        <span class="badge ${isIn ? "in" : "out"}">${isIn ? "IN" : "OUT"}</span>
        <div class="activity-wallet">${shortAddr(wallet || "")}</div>
        <div class="activity-amt">${fmtUSDC(usd)}</div>
      </div>
      <div class="activity-time">${fmtTime(t.timeStamp)}</div>
    `;
    box.appendChild(div);
  });
}

function renderUI(stats) {
  $("bridgeInTotal").textContent = fmtUSDC(stats.inTotalUSDC);
  $("bridgeOutTotal").textContent = fmtUSDC(stats.outTotalUSDC);

  $("bridgeInCount").textContent = stats.inCount;
  $("bridgeOutCount").textContent = stats.outCount;

  $("uniqueBridgers").textContent = stats.unique;
  $("totalTxs").textContent = stats.totalInTxs;

  $("volume24h").textContent = fmtUSDC(stats.volume24hUSDC);

  $("totalBridged").textContent = fmtUSDC(stats.inTotalUSDC);

  $("updatedAt").textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

async function refresh() {
  try {
    const all = await fetchBridgeTxs();
    txs = all;

    const stats = buildStats(all);
    renderUI(stats);
    renderLeaderboard(stats.inTxs);
    renderRecent(all);
  } catch (e) {
    showError(e?.message || "Something went wrong");
  }
}

function setup() {
  $("contractShort").textContent = shortAddr(BRIDGE_CA);

  $("copyBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(BRIDGE_CA);
  });

  $("refreshBtn").addEventListener("click", refresh);

  $("autoToggle").addEventListener("click", () => {
    autoRefresh = !autoRefresh;
    $("autoToggle").classList.toggle("on", autoRefresh);
  });

  setInterval(() => {
    if (autoRefresh) refresh();
  }, 60000);

  refresh();
}

setup();

// ====== CONFIG ======
const res = await fetch("/api/bridge-txs");
const data = await res.json();

if (!res.ok) throw new Error(data.error || "API error");

if (data.status !== "1") {
  throw new Error(data.message || "Etherscan error");
}


// ====== UI ELEMENTS ======
const contractShort = document.getElementById("contractShort");
const copyBtn = document.getElementById("copyBtn");
const updatedAt = document.getElementById("updatedAt");
const errorBox = document.getElementById("errorBox");

const totalBridgedEl = document.getElementById("totalBridged");
const uniqueBridgersEl = document.getElementById("uniqueBridgers");
const totalTxsEl = document.getElementById("totalTxs");
const volume24hEl = document.getElementById("volume24h");

const leaderboardBody = document.getElementById("leaderboardBody");
const recentBox = document.getElementById("recentBox");

const refreshBtn = document.getElementById("refreshBtn");
const autoToggle = document.getElementById("autoToggle");
const searchInput = document.getElementById("searchInput");
const exportBtn = document.getElementById("exportBtn");

let autoRefresh = true;
let allBridgers = [];
let allDeposits = [];

// ====== HELPERS ======
function shortAddr(a) {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function weiToEth(wei) {
  return Number(wei) / 1e18;
}

function formatEth(num) {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleString();
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

function within24h(ts) {
  return Date.now() / 1000 - ts <= 86400;
}

// ====== FETCH TXS ======
async function fetchBridgeTxs() {
  hideError();

  if (!ETHERSCAN_API_KEY || ETHERSCAN_API_KEY === "PUT_YOUR_KEY_HERE") {
    showError("Missing ETHERSCAN API KEY in app.js");
    return;
  }

  refreshBtn.textContent = "Loading...";

  try {
    const url =
      `https://api.etherscan.io/api?module=account&action=txlist` +
      `&address=${BRIDGE_CA}` +
      `&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "1") {
      throw new Error(data.message || "Etherscan error");
    }

    const txs = data.result || [];

    // deposits = successful txs sent to contract with value > 0
    const deposits = txs
      .filter((t) => (t.to || "").toLowerCase() === BRIDGE_CA.toLowerCase())
      .filter((t) => t.isError === "0")
      .filter((t) => BigInt(t.value) > 0n);

    allDeposits = deposits;

    // build bridger leaderboard
    const map = new Map();

    for (const t of deposits) {
      const wallet = (t.from || "").toLowerCase();
      const valueWei = BigInt(t.value);
      const ts = Number(t.timeStamp);

      if (!map.has(wallet)) {
        map.set(wallet, {
          wallet,
          totalWei: valueWei,
          deposits: 1,
          lastTs: ts,
        });
      } else {
        const prev = map.get(wallet);
        map.set(wallet, {
          wallet,
          totalWei: prev.totalWei + valueWei,
          deposits: prev.deposits + 1,
          lastTs: Math.max(prev.lastTs, ts),
        });
      }
    }

    const bridgers = Array.from(map.values()).sort((a, b) => {
      if (a.totalWei === b.totalWei) return b.deposits - a.deposits;
      return b.totalWei > a.totalWei ? 1 : -1;
    });

    allBridgers = bridgers;

    // stats
    const totalWei = deposits.reduce((acc, t) => acc + BigInt(t.value), 0n);
    const totalEth = weiToEth(totalWei);

    const vol24Wei = deposits
      .filter((t) => within24h(Number(t.timeStamp)))
      .reduce((acc, t) => acc + BigInt(t.value), 0n);

    const vol24Eth = weiToEth(vol24Wei);

    totalBridgedEl.textContent = `${formatEth(totalEth)} ETH`;
    uniqueBridgersEl.textContent = `${bridgers.length}`;
    totalTxsEl.textContent = `${deposits.length}`;
    volume24hEl.textContent = `${formatEth(vol24Eth)} ETH`;

    updatedAt.textContent = `Updated ${new Date().toLocaleTimeString()}`;

    renderLeaderboard();
    renderRecent();
  } catch (err) {
    showError(err.message || "Something went wrong");
  } finally {
    refreshBtn.textContent = "⟳ Refresh";
  }
}

// ====== RENDER ======
function renderLeaderboard() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const list = q ? allBridgers.filter((b) => b.wallet.includes(q)) : allBridgers;

  if (list.length === 0) {
    leaderboardBody.innerHTML = `<tr><td colspan="5" class="empty">No bridge data available</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = list.slice(0, 20).map((b, i) => {
    const eth = weiToEth(b.totalWei);
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${shortAddr(b.wallet)}</td>
        <td><b>${formatEth(eth)} ETH</b></td>
        <td>${b.deposits}</td>
        <td>${formatTime(b.lastTs)}</td>
      </tr>
    `;
  }).join("");
}

function renderRecent() {
  const recent = [...allDeposits]
    .sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp))
    .slice(0, 12);

  if (recent.length === 0) {
    recentBox.innerHTML = `<div class="recent-empty">No recent activity</div>`;
    return;
  }

  recentBox.innerHTML = recent.map((t) => {
    const eth = weiToEth(BigInt(t.value));
    return `
      <a class="recent-item" href="https://etherscan.io/tx/${t.hash}" target="_blank">
        <div class="recent-top">
          <div>${shortAddr(t.from)}</div>
          <div style="color: var(--cyan)">${formatEth(eth)} ETH</div>
        </div>
        <div class="recent-time">${formatTime(Number(t.timeStamp))}</div>
      </a>
    `;
  }).join("");
}

// ====== EXPORT ======
function exportCSV() {
  if (!allBridgers.length) return;

  const rows = allBridgers.map((b, idx) => ({
    rank: idx + 1,
    wallet: b.wallet,
    total_eth: weiToEth(b.totalWei),
    deposits: b.deposits,
    last_bridge: new Date(b.lastTs * 1000).toISOString(),
  }));

  const headers = Object.keys(rows[0]);
  const csv =
    headers.join(",") +
    "\n" +
    rows.map((r) => headers.map((h) => JSON.stringify(r[h])).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "megaeth-bridge-tracker.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ====== EVENTS ======
contractShort.textContent = shortAddr(BRIDGE_CA);

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(BRIDGE_CA);
});

refreshBtn.addEventListener("click", fetchBridgeTxs);

autoToggle.addEventListener("click", () => {
  autoRefresh = !autoRefresh;
  autoToggle.classList.toggle("on", autoRefresh);
});

searchInput.addEventListener("input", renderLeaderboard);
exportBtn.addEventListener("click", exportCSV);

// auto refresh
setInterval(() => {
  if (autoRefresh) fetchBridgeTxs();
}, 60000);

// initial load
fetchBridgeTxs();

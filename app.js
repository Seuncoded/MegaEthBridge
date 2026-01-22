// ====== CONFIG ======
const BRIDGE_CA = "0x0CA3A2FBC3D770b578223FBB6b062fa875a2eE75".toLowerCase();

// ====== UI ELEMENTS ======
const contractShort = document.getElementById("contractShort");
const copyBtn = document.getElementById("copyBtn");
const updatedAt = document.getElementById("updatedAt");
const errorBox = document.getElementById("errorBox");

const bridgeInTotalEl = document.getElementById("bridgeInTotal");
const bridgeInCountEl = document.getElementById("bridgeInCount");
const bridgeOutTotalEl = document.getElementById("bridgeOutTotal");
const bridgeOutCountEl = document.getElementById("bridgeOutCount");

const uniqueBridgersEl = document.getElementById("uniqueBridgers");
const totalTxsEl = document.getElementById("totalTxs");
const volume24hEl = document.getElementById("volume24h");
const totalBridgedEl = document.getElementById("totalBridged");

const leaderboardBody = document.getElementById("leaderboardBody");
const recentBox = document.getElementById("recentBox");

const refreshBtn = document.getElementById("refreshBtn");
const autoToggle = document.getElementById("autoToggle");
const searchInput = document.getElementById("searchInput");
const exportBtn = document.getElementById("exportBtn");

let autoRefresh = true;

let allInDeposits = [];
let allOutTxs = [];
let allBridgers = [];

// ====== HELPERS ======
function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function weiToEth(weiBig) {
  return Number(weiBig) / 1e18;
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

function normalizeTx(t) {
  return {
    hash: t.hash,
    from: (t.from || "").toLowerCase(),
    to: (t.to || "").toLowerCase(),
    value: t.value || "0",
    timeStamp: Number(t.timeStamp || "0"),
    isError: t.isError ?? "0",
  };
}

// ====== MAIN FETCH ======
async function fetchBridgeTxs() {
  hideError();
  refreshBtn.textContent = "Loading...";

  try {
    const res = await fetch("/api/bridge-txs", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) throw new Error(data?.error || "API error");

    // Your API returns: { normal: {...}, internal: {...} }
    const normalTxs = (data?.normal?.result || []).map(normalizeTx);
    const internalTxs = (data?.internal?.result || []).map(normalizeTx);

    const all = [...normalTxs, ...internalTxs];

    // Bridge IN = tx sent TO contract
    const bridgeIn = all
      .filter((t) => t.to === BRIDGE_CA)
      .filter((t) => BigInt(t.value || "0") > 0n)
      .filter((t) => t.isError === "0" || t.isError === undefined);

    // Bridge OUT = tx sent FROM contract
    const bridgeOut = all
      .filter((t) => t.from === BRIDGE_CA)
      .filter((t) => BigInt(t.value || "0") > 0n)
      .filter((t) => t.isError === "0" || t.isError === undefined);

    allInDeposits = bridgeIn;
    allOutTxs = bridgeOut;

    // ====== TOTALS ======
    const totalInWei = bridgeIn.reduce((acc, t) => acc + BigInt(t.value), 0n);
    const totalOutWei = bridgeOut.reduce((acc, t) => acc + BigInt(t.value), 0n);

    const totalInEth = weiToEth(totalInWei);
    const totalOutEth = weiToEth(totalOutWei);

    // 24H volume (IN)
    const vol24Wei = bridgeIn
      .filter((t) => within24h(t.timeStamp))
      .reduce((acc, t) => acc + BigInt(t.value), 0n);
    const vol24Eth = weiToEth(vol24Wei);

    // ====== LEADERBOARD (Top Bridgers by IN) ======
    const map = new Map();

    for (const t of bridgeIn) {
      const wallet = t.from;
      const v = BigInt(t.value);
      const ts = t.timeStamp;

      if (!map.has(wallet)) {
        map.set(wallet, { wallet, totalWei: v, deposits: 1, lastTs: ts });
      } else {
        const prev = map.get(wallet);
        map.set(wallet, {
          wallet,
          totalWei: prev.totalWei + v,
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

    // ====== UPDATE UI ======
    bridgeInTotalEl.textContent = `${formatEth(totalInEth)} ETH`;
    bridgeInCountEl.textContent = `${bridgeIn.length}`;

    bridgeOutTotalEl.textContent = `${formatEth(totalOutEth)} ETH`;
    bridgeOutCountEl.textContent = `${bridgeOut.length}`;

    uniqueBridgersEl.textContent = `${bridgers.length}`;
    totalTxsEl.textContent = `${bridgeIn.length}`;
    volume24hEl.textContent = `${formatEth(vol24Eth)} ETH`;

    // keep this as "Total IN" (same as Bridge In total)
    totalBridgedEl.textContent = `${formatEth(totalInEth)} ETH`;

    updatedAt.textContent = `Updated ${new Date().toLocaleTimeString()}`;

    renderLeaderboard();
    renderRecent();
  } catch (err) {
    showError(err?.message || "Something went wrong");
  } finally {
    refreshBtn.textContent = "⟳ Refresh";
  }
}

// ====== RENDER ======
function renderLeaderboard() {
  const q = (searchInput.value || "").trim().toLowerCase();
  const list = q ? allBridgers.filter((b) => b.wallet.includes(q)) : allBridgers;

  if (!list.length) {
    leaderboardBody.innerHTML = `<tr><td colspan="5" class="empty">No bridge data available</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = list
    .slice(0, 20)
    .map((b, i) => {
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
    })
    .join("");
}

function renderRecent() {
  const merged = [
    ...allInDeposits.map((t) => ({ ...t, dir: "IN" })),
    ...allOutTxs.map((t) => ({ ...t, dir: "OUT" })),
  ].sort((a, b) => b.timeStamp - a.timeStamp);

  const recent = merged.slice(0, 12);

  if (!recent.length) {
    recentBox.innerHTML = `<div class="recent-empty">No recent activity</div>`;
    return;
  }

  recentBox.innerHTML = recent
    .map((t) => {
      const eth = weiToEth(BigInt(t.value));
      const badge =
        t.dir === "IN"
          ? `<span class="badge in">IN</span>`
          : `<span class="badge out">OUT</span>`;

      const who = t.dir === "IN" ? t.from : t.to;

      return `
        <a class="recent-item" href="https://etherscan.io/tx/${t.hash}" target="_blank">
          <div class="recent-top">
            <div>${badge} ${shortAddr(who)}</div>
            <div class="recent-amt">${formatEth(eth)} ETH</div>
          </div>
          <div class="recent-time">${formatTime(t.timeStamp)}</div>
        </a>
      `;
    })
    .join("");
}

// ====== EXPORT CSV ======
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

setInterval(() => {
  if (autoRefresh) fetchBridgeTxs();
}, 60000);

// initial load
fetchBridgeTxs();

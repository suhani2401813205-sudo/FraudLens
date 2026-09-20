/*
 * live-store.js
 * -----------------------------------------------------------------------
 * Included on all four pages. Responsibilities:
 *   1. Connect to the Node backend via Socket.io and show connection status
 *   2. Keep a rolling window of recent transactions in localStorage, so
 *      every page (not just Live Monitor) can read live/recent data —
 *      even right after a full page navigation, which loses in-memory JS state
 *   3. Highlight the active sidebar link based on <body data-page="...">
 *   4. Dispatch DOM events ("fraudlens:init", "fraudlens:transaction") that
 *      each page's own script listens for, to render its own UI
 *
 * Change this if the Node backend runs somewhere other than localhost:5000
 */
const NODE_URL = "http://localhost:5000";
const STORE_KEY = "fraudlens_transactions";
const SELECTED_KEY = "fraudlens_selected";
const MAX_STORED = 200; // rolling window cap

// ---------- Formatting / risk helpers (shared by every page) ----------
function riskPillClass(riskScore) {
  if (riskScore >= 75) return "high";
  if (riskScore >= 40) return "medium";
  return "low";
}
function riskLabel(cls) {
  return cls === "high" ? "High" : cls === "medium" ? "Medium" : "Low";
}
function formatINR(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ---------- Persistent store (localStorage-backed) ----------
function getStoredTransactions() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}

function addStoredTransaction(txn) {
  const list = getStoredTransactions();
  // Give each transaction a stable-enough id for this session (no real
  // transaction id exists upstream yet) so pages can key off it.
  txn._id = `${txn.step}-${txn.nameOrig}-${txn.nameDest}-${Date.now()}`;
  list.unshift(txn);
  if (list.length > MAX_STORED) list.length = MAX_STORED;
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
  return txn;
}

function setSelectedTransaction(txn) {
  sessionStorage.setItem(SELECTED_KEY, JSON.stringify(txn));
}
function getSelectedTransaction() {
  try {
    return JSON.parse(sessionStorage.getItem(SELECTED_KEY));
  } catch {
    return null;
  }
}

// Every row/card that represents a transaction should call this so
// clicking it anywhere in the app goes to the same Transaction Detail page.
function goToDetail(txn) {
  setSelectedTransaction(txn);
  window.location.href = "transaction.html";
}

// ---------- Sidebar active-state ----------
function highlightActiveNav() {
  const current = document.body.dataset.page;
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === current);
  });
}

// ---------- Socket.io connection (shared status indicator) ----------
function initLiveStore() {
  highlightActiveNav();

  const statusDot = document.getElementById("live-dot");
  const statusText = document.getElementById("stream-status-text");

  function setStatus(connected, message) {
    if (statusDot) statusDot.classList.toggle("offline", !connected);
    if (statusText) statusText.textContent = message;
  }

  // Let the page render whatever it already has in storage immediately,
  // before any new socket events arrive (important after a page navigation).
  document.dispatchEvent(new CustomEvent("fraudlens:init", { detail: getStoredTransactions() }));

  if (typeof io === "undefined") {
    setStatus(false, "Socket.io library failed to load");
    return;
  }

  const socket = io(NODE_URL);

  socket.on("connect", () => setStatus(true, "Stream connected — waiting for transactions"));
  socket.on("disconnect", () => setStatus(false, "Stream disconnected — is the Node backend running?"));
  socket.on("connect_error", () => setStatus(false, `Could not connect to ${NODE_URL} — start the Node backend first`));

  // routes/predict.js emits io.emit("transaction", {...transaction, ...result})
  socket.on("transaction", (txn) => {
    setStatus(true, "Replaying held-out transactions in time order");
    const stored = addStoredTransaction(txn);
    document.dispatchEvent(new CustomEvent("fraudlens:transaction", { detail: stored }));
  });

  // routes/actions.js emits io.emit("action", record) when any analyst
  // takes an action (Hold/Review/False positive) on any open page
  socket.on("action", (record) => {
    document.dispatchEvent(new CustomEvent("fraudlens:action", { detail: record }));
  });
}

// ---------- Analyst actions (Hold / Send for review / Mark as false positive) ----------
async function submitAction(action, transaction) {
  const response = await fetch(`${NODE_URL}/api/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, transaction }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}

async function fetchRecentActions(limit = 20) {
  const response = await fetch(`${NODE_URL}/api/actions?limit=${limit}`);
  if (!response.ok) throw new Error(`Failed to load actions (${response.status})`);
  return response.json();
}

document.addEventListener("DOMContentLoaded", initLiveStore);
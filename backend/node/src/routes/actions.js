// src/routes/actions.js
// -----------------------------------------------------------------------
// POST /api/actions — an analyst acting on a transaction (Hold / Send
// for review / Mark as false positive) from the Transaction Detail page.
// GET  /api/actions — recent actions, so the page can show a real log
// instead of the button just doing nothing after the click.
//
// Storage: SQLite (src/db.js) — persists across server restarts, unlike
// the earlier in-memory array version.

const express = require("express");
const router = express.Router();
const db = require("../db");

const VALID_ACTIONS = ["Hold transaction", "Send for review", "Mark as false positive"];
const MAX_LIMIT = 200;

const insertStmt = db.prepare(`
  INSERT INTO actions (id, action, transaction_json, analyst, taken_at)
  VALUES (@id, @action, @transaction_json, @analyst, @taken_at)
`);

const selectStmt = db.prepare(`
  SELECT id, action, transaction_json, analyst, taken_at
  FROM actions
  ORDER BY taken_at DESC
  LIMIT ?
`);

function rowToRecord(row) {
  return {
    id: row.id,
    action: row.action,
    transaction: JSON.parse(row.transaction_json),
    analyst: row.analyst,
    takenAt: row.taken_at,
  };
}

router.post("/actions", (req, res) => {
  const { action, transaction } = req.body || {};

  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` });
  }
  if (!transaction || !transaction.nameOrig || !transaction.nameDest) {
    return res.status(400).json({ error: "transaction (with at least nameOrig/nameDest) is required" });
  }

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    transaction,
    analyst: "S. Patil", // hardcoded for now — replace once there's real auth
    takenAt: new Date().toISOString(),
  };

  insertStmt.run({
    id: record.id,
    action: record.action,
    transaction_json: JSON.stringify(record.transaction),
    analyst: record.analyst,
    taken_at: record.takenAt,
  });

  // Broadcast so any open page (Transaction Detail, a future audit log
  // page, etc.) can update live without polling.
  const io = req.app.get("io");
  if (io) io.emit("action", record);

  res.status(201).json(record);
});

router.get("/actions", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, MAX_LIMIT);
  const rows = selectStmt.all(limit);
  res.json(rows.map(rowToRecord));
});

module.exports = router;
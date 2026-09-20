// src/routes/actions.js
// -----------------------------------------------------------------------
// POST /api/actions — an analyst acting on a transaction (Hold / Send
// for review / Mark as false positive) from the Transaction Detail page.
// GET  /api/actions — recent actions, so the page can show a real log
// instead of the button just doing nothing after the click.
//
// Storage is in-memory (resets when the server restarts) — good enough
// for a demo/portfolio project. Swap this for a real database (Mongo/
// Postgres) later without changing the frontend's fetch calls.

const express = require("express");
const router = express.Router();

const VALID_ACTIONS = ["Hold transaction", "Send for review", "Mark as false positive"];
const actions = []; // in-memory log, newest first
const MAX_STORED = 200;

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

  actions.unshift(record);
  if (actions.length > MAX_STORED) actions.length = MAX_STORED;

  // Broadcast so any open page (Transaction Detail, a future audit log
  // page, etc.) can update live without polling.
  const io = req.app.get("io");
  if (io) io.emit("action", record);

  res.status(201).json(record);
});

router.get("/actions", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, MAX_STORED);
  res.json(actions.slice(0, limit));
});

module.exports = router;
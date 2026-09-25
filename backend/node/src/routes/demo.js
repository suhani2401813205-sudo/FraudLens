// src/routes/demo.js
// -----------------------------------------------------------------------
// POST /api/demo/start — replays a small, curated set of transactions
// (bundled in data/demo-transactions.json) through the SAME prediction +
// broadcast path as a real replay (mlService.getPrediction + io.emit).
//
// Why this exists: ml/replay.py only runs from someone's own terminal.
// A recruiter clicking a live link would see an empty dashboard unless
// you personally ran the script first. This route lets the deployed
// Node service run a short, self-contained demo on demand — anyone can
// click "Run Live Demo" on the dashboard and see the whole pipeline work,
// with zero local setup.

const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const { getPrediction } = require("../services/mlService");
const settingsRoutes = require("./settings");

const DEMO_DATA_PATH = path.join(__dirname, "..", "..", "data", "demo-transactions.json");
const demoTransactions = JSON.parse(fs.readFileSync(DEMO_DATA_PATH, "utf-8"))
  .sort((a, b) => a.step - b.step);

const SECONDS_PER_STEP = 0.4; // fixed, fast pace — this is a short showcase run, not a full simulation

let demoState = { running: false, startedAt: null };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo(io) {
  demoState = { running: true, startedAt: new Date().toISOString() };
  io.emit("demoStatus", demoState);

  let lastStep = null;
  for (const transaction of demoTransactions) {
    if (lastStep !== null) {
      const gapMs = Math.max(transaction.step - lastStep, 0) * SECONDS_PER_STEP * 1000;
      await sleep(gapMs);
    }
    lastStep = transaction.step;

    // Same real detection path a normal /api/predict call uses — this is
    // not faked or pre-computed, the model genuinely scores each one live.
    if (!settingsRoutes.getSettings().modelEnabled) continue;

    try {
      const result = await getPrediction(transaction);
      io.emit("transaction", { ...transaction, ...result });
    } catch (err) {
      console.error("Demo run: prediction failed for one transaction:", err.message);
      // Keep going — one failed call (e.g. a cold-starting ML service)
      // shouldn't kill the whole demo run.
    }
  }

  demoState = { running: false, startedAt: null };
  io.emit("demoStatus", demoState);
}

router.post("/demo/start", (req, res) => {
  if (demoState.running) {
    return res.status(409).json({ error: "A demo run is already in progress" });
  }
  const io = req.app.get("io");
  runDemo(io); // intentionally not awaited — runs in the background, response returns immediately
  res.status(202).json({ message: `Demo started — ${demoTransactions.length} transactions`, ...demoState });
});

router.get("/demo/status", (req, res) => {
  res.json(demoState);
});

module.exports = router;
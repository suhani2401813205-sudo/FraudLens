// src/routes/settings.js
// -----------------------------------------------------------------------
// GET  /api/settings — current backend settings
// POST /api/settings — update one or more settings
//
// Only `modelEnabled` has real backend behavior: when false, /api/predict
// refuses to call the ML service (routes/predict.js checks this). This is
// what makes the Alerts & Rules toggle "real" instead of decorative —
// turning it off actually stops detection.
//
// In-memory (resets on server restart) — same tradeoff as actions.js
// until a real database is added.

const express = require("express");
const router = express.Router();

const settings = {
  modelEnabled: true, // RandomForest classifier — real: gates /api/predict
};

router.get("/settings", (req, res) => {
  res.json(settings);
});

router.post("/settings", (req, res) => {
  const { modelEnabled } = req.body || {};

  if (typeof modelEnabled === "boolean") {
    settings.modelEnabled = modelEnabled;
  }

  const io = req.app.get("io");
  if (io) io.emit("settings", settings); // keep every open tab/page in sync

  res.json(settings);
});

// Exported so routes/predict.js can check the live value without an HTTP round-trip
router.getSettings = () => settings;

module.exports = router;
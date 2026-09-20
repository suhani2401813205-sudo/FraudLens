// src/routes/predict.js
//
// This is the route the FRONTEND talks to (not Flask directly).
// Keeping the frontend pointed at Node — not Flask — means later we
// can add things like saving flagged transactions to a database, or
// broadcasting them over Socket.io, without the frontend needing to
// change anything.

const express = require("express");
const { getPrediction } = require("../services/mlService");

const router = express.Router();

const REQUIRED_FIELDS = [
  "step", "type", "amount", "nameOrig", "oldbalanceOrg",
  "newbalanceOrig", "nameDest", "oldbalanceDest", "newbalanceDest",
];

router.post("/predict", async (req, res) => {
  const transaction = req.body;

  const missing = REQUIRED_FIELDS.filter((field) => !(field in transaction));
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }

  try {
    const result = await getPrediction(transaction);

    // req.app.get("io") is set up in index.js — this pushes the result
    // to any connected dashboard clients in real time, in addition to
    // returning it in the HTTP response below.
    const io = req.app.get("io");
    if (io) {
      io.emit("transaction", { ...transaction, ...result });
    }

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
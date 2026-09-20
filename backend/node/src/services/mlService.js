// src/services/mlService.js
//
// All communication with the Python Flask ML service lives here.
// Routes never call axios directly — they call these functions instead.
// This way, if the ML service URL, auth, or protocol ever changes,
// only this one file needs updating.

const axios = require("axios");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:5001";

/**
 * Sends one transaction to the Flask ML service and returns its
 * fraud prediction. Throws if the ML service is unreachable or
 * returns an error, so the caller (route) can decide how to respond.
 *
 * @param {object} transaction - must match the fields predict.py expects:
 *   step, type, amount, nameOrig, oldbalanceOrg, newbalanceOrig,
 *   nameDest, oldbalanceDest, newbalanceDest
 */
async function getPrediction(transaction) {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict`, transaction, {
      timeout: 5000, // fail fast rather than hanging the request
    });
    return response.data; // { prediction, fraud_probability, risk_score }
  } catch (err) {
    if (err.response) {
      // Flask responded, but with an error (e.g. missing fields -> 400)
      const message = err.response.data?.error || "ML service returned an error";
      throw new Error(message);
    }
    // Flask didn't respond at all (service down, wrong port, etc.)
    throw new Error("Could not reach the ML service — is app.py running?");
  }
}

/**
 * Checks whether the Flask ML service is up, via its /health endpoint.
 * Useful for a startup check or a dashboard status indicator.
 */
async function checkMlServiceHealth() {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 3000 });
    return response.data?.status === "ok";
  } catch (err) {
    return false;
  }
}

module.exports = { getPrediction, checkMlServiceHealth };
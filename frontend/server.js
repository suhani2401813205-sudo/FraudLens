// server.js
// -----------------------------------------------------------------------
// Serves the frontend (public/) as static files on localhost, so the
// pages navigate via real URLs (http://localhost:3000/...) instead of
// file:// — needed for clean multi-page navigation and consistent
// localStorage/sessionStorage behavior across pages.
//
// Run: node server.js   (or: npm start)
// Then open: http://localhost:3000

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`FraudLens frontend running on http://localhost:${PORT}`);
  console.log(`Make sure the Node backend (port 5000) and Flask ML service (port 5001) are running too.`);
});

// src/index.js
// Entry point for the FraudLens Express backend.

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const predictRoutes = require("./routes/predict");
const actionsRoutes = require("./routes/actions");
const { checkMlServiceHealth } = require("./services/mlService");

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());

// --- HTTP server + Socket.io (real-time layer) ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.set("io", io); // routes access this via req.app.get("io")

io.on("connection", (socket) => {
  console.log("Dashboard connected:", socket.id);
  socket.on("disconnect", () => console.log("Dashboard disconnected:", socket.id));
});

// --- Routes ---
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", predictRoutes); // -> POST /api/predict
app.use("/api", actionsRoutes); // -> POST /api/actions, GET /api/actions

// --- Startup: confirm the Flask ML service is reachable ---
async function startupCheck() {
  const mlUp = await checkMlServiceHealth();
  if (mlUp) {
    console.log("✓ ML service is reachable");
  } else {
    console.warn("⚠ ML service is NOT reachable — start it with: python app.py (in backend/ml_service)");
  }
}

server.listen(PORT, () => {
  console.log(`FraudLens backend running on http://localhost:${PORT}`);
  startupCheck();
});
// src/db.js
// -----------------------------------------------------------------------
// A single SQLite file for persistent storage — analyst actions now
// survive a server restart (previously they lived only in a JS array
// in memory and were lost every time). No separate DB server to run;
// better-sqlite3 reads/writes the file directly and is synchronous,
// which keeps the route handlers in actions.js simple.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "fraudlens.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL"); // safer for concurrent reads while a write is happening

db.exec(`
  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    transaction_json TEXT NOT NULL,
    analyst TEXT NOT NULL,
    taken_at TEXT NOT NULL
  )
`);

module.exports = db;
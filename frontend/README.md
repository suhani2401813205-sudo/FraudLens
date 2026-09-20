# FraudLens Frontend

Four separate pages, served on localhost (not opened via file://), sharing
a common stylesheet and a Socket.io-backed live data store.

## Structure
```
frontend/
├── server.js          Static file server (localhost:3000)
├── package.json
└── public/
    ├── index.html       Live Monitor — KPIs + live feed (all rows clickable)
    ├── transaction.html Transaction Detail — full breakdown of a clicked row
    ├── network.html     Network View — fraud rings grouped from high-risk txns
    ├── rules.html        Alerts & Rules — live tier counts + model toggles
    ├── css/style.css     Shared styling
    └── js/live-store.js  Shared Socket.io connection + localStorage store
```

## Running it
1. Start Flask: `cd backend/ml_service && python app.py`
2. Start Node: `cd backend/node && npm start`
3. Start this frontend: `cd frontend && npm install && npm start`
4. Open **http://localhost:3000** in your browser
5. Run the replay: `cd ml && python replay.py --demo --demo-fraud 10 --demo-normal 40 --speed 0.3`

## How pages share data
- `js/live-store.js` (included on every page) connects to the Node backend
  via Socket.io and keeps the last 200 transactions in `localStorage`
  (key `fraudlens_transactions`) — so Network View and Alerts & Rules stay
  live even though they're separate page loads, not a single-page app.
- Clicking a row in Live Monitor stores that one transaction in
  `sessionStorage` (key `fraudlens_selected`) and navigates to
  `transaction.html`, which reads it back and renders the full detail.
  **Every row is clickable** — this was a bug in the earlier single-file
  version where only newly-added rows had click handlers.

## Honesty notes (say this in a demo, don't hide it)
- **Network View** groups accounts into "rings" using a simple
  connected-components heuristic on high-risk transactions seen this
  session — it is NOT the GNN-based ring detection described in the
  project plan. Label it as such if asked.
- **Transaction Detail**'s "contributing factors" are computed client-side
  from raw balance fields — NOT real SHAP values. SHAP integration is a
  planned next step in `predict.py`.
- **Alerts & Rules** toggles and action buttons (Hold/Review/False positive)
  are UI-only — not yet wired to backend behavior.

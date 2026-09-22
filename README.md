# FraudLens

A real-time, explainable fraud detection platform for a fictional bank
(**NovaBank**). Detects suspicious transactions using a trained ML model,
explains every flag with real SHAP values, groups high-risk transactions
into potential fraud rings, and streams everything to a live, mobile-responsive
dashboard.

> Built as an ML + software internship portfolio project, using the
> [PaySim](https://www.kaggle.com/datasets/ealaxi/paysim1) synthetic
> mobile-money dataset.

## What it does

- Detects fraudulent transactions using a **RandomForestClassifier**
  trained on engineered balance/behavior features
- Explains each prediction with **real SHAP values** (not a heuristic) —
  shows exactly which features pushed the model toward "fraud" or "normal"
- Groups high-risk transactions into **fraud rings** using a
  connected-components heuristic (accounts that share a flagged transaction)
- Streams predictions to a **live dashboard** in real time via Socket.io
- Lets an analyst **act on a transaction** (Hold / Send for review / Mark
  as false positive) — persisted in SQLite and broadcast to every open page
- Editable risk thresholds and a real detection on/off toggle in Alerts & Rules
- Real browser notifications for high-risk transactions (opt-in)
- Simulates a live transaction feed by replaying held-out test data in
  time order (see "Honesty notes" below)

## Architecture

```
data/raw/paysim.csv
        |
        v
ml/preprocessing.ipynb  ---->  data/processed/{train,test}.csv
        |
        v
ml/train.py  ---->  ml/model/{fraud_model,feature_columns,threshold}.pkl
        |
        v
ml/predict.py  (loads model + SHAP TreeExplainer)
        |
        v
backend/ml_service (Flask)  ---->  POST /predict
        |
        v
backend/node (Express + Socket.io + SQLite)  ---->  /api/predict, /api/actions, /api/settings
        |
        v
frontend (4 static pages)  ---->  Live Monitor . Transaction Detail .
                                    Network View . Alerts & Rules
        ^
        |
ml/replay.py  (streams data/processed/test.csv -> Node, in time order)
```

## Tech stack

| Layer | Tech |
|---|---|
| Data / features | Pandas, NumPy |
| Model | scikit-learn (RandomForestClassifier) |
| Explainability | SHAP (TreeExplainer) |
| ML API | Flask + flask-cors, gunicorn (production) |
| Backend | Node.js, Express, Socket.io, better-sqlite3 |
| Frontend | Vanilla HTML/CSS/JS, Chart.js, mobile-responsive (no framework, no build step) |
| Live feed | Custom replay script over the held-out test set |

## Folder structure

```
FraudLens/
├── package.json                  <- root: run the whole stack with one command
├── data/
│   ├── raw/paysim.csv           <- download from Kaggle, place here
│   └── processed/{train,test}.csv
├── ml/
│   ├── notebooks/preprocessing.ipynb   <- EDA, feature engineering, split, training
│   ├── preprocessing.py         <- shared feature-engineering logic
│   ├── train.py                 <- standalone training script (alternative to the notebook)
│   ├── predict.py               <- inference + SHAP explanation
│   ├── replay.py                <- live-stream simulator (--demo, --force-rings)
│   └── model/*.pkl              <- trained model artifacts (committed — needed for deployment)
├── backend/
│   ├── ml_service/              <- Flask API wrapping predict.py
│   │   ├── app.py
│   │   ├── Procfile              <- tells Render how to start this service
│   │   └── requirements.txt
│   └── node/                    <- Express API + Socket.io + SQLite
│       ├── src/
│       │   ├── index.js
│       │   ├── db.js
│       │   ├── routes/{predict,actions,settings}.js
│       │   └── services/mlService.js
│       ├── data/fraudlens.db     <- SQLite file (gitignored, auto-created)
│       └── package.json
└── frontend/
    ├── server.js                 <- static file server (localhost:3000, local dev only)
    ├── package.json
    └── public/
        ├── index.html             <- Live Monitor
        ├── transaction.html       <- Transaction Detail (SHAP explanations)
        ├── network.html           <- Network View (fraud rings)
        ├── rules.html             <- Alerts & Rules
        ├── css/style.css          <- includes mobile responsive breakpoints
        └── js/
            ├── config.js           <- THE file to edit after deploying (backend URL)
            └── live-store.js       <- shared Socket.io + localStorage data layer
```

## Setup — from scratch

1. **Get the data**: download `paysim.csv` from
   [Kaggle](https://www.kaggle.com/datasets/ealaxi/paysim1), place it at
   `data/raw/paysim.csv`
2. **Run preprocessing + training**: open `ml/notebooks/preprocessing.ipynb`,
   restart the kernel, Run All. This produces `data/processed/{train,test}.csv`
   and `ml/model/*.pkl`
3. **Install everything** (from the project root):
   ```
   npm install
   cd backend/ml_service && pip install -r requirements.txt && cd ../..
   cd backend/node && npm install && cd ../..
   cd frontend && npm install && cd ..
   ```

## Running it locally

**One command, one terminal:**
```
npm start
```
This runs Flask + Node + the frontend server together (color-coded logs).
Open **http://localhost:3000**, then in a second terminal:
```
cd ml
python replay.py --demo --force-rings --speed 0.3
```

Or run everything including the replay automatically:
```
npm run demo
```

Useful replay flags:
- `--demo` — curated mix guaranteeing some fraud cases show up (plain
  replay can easily show zero fraud, since it's only ~0.13% of the data)
- `--force-rings` — guarantees ring-forming transactions are included, so
  Network View has something to show
- `--speed 0.1` — fast playback for a live demo
- `--limit N` — replay only the first N transactions

## Deploying (Render)

Three separate services, all free-tier friendly. Push this repo to GitHub first.

**1. Flask ML service — New Web Service**
- Root directory: `backend/ml_service`
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app`
- No environment variables needed
- Note the URL Render gives you, e.g. `https://fraudlens-ml.onrender.com`

**2. Node backend — New Web Service**
- Root directory: `backend/node`
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `ML_SERVICE_URL` = the Flask URL from step 1
- Note this service's URL too, e.g. `https://fraudlens-backend.onrender.com`

**3. Frontend — New Static Site**
- Root directory: `frontend/public`
- Build command: *(leave empty — no build step)*
- Publish directory: `.`
- **Before deploying**, edit `frontend/public/js/config.js` and set
  `window.FRAUDLENS_NODE_URL` to the Node URL from step 2, then commit and push
- This is the URL you'll actually open and demo from

**Free tier note:** Render's free services sleep after inactivity — the
first request after sleeping can take 30–60 seconds. Open all three URLs
a few minutes before a live demo to "warm them up."

**To update the deployed model:** retrain locally (`train.py` or the
notebook), commit the new `.pkl` files, push — Render redeploys automatically.

## Honesty notes (say these in a demo, don't hide them)

- **"Live" data isn't really live.** No real bank feed is publicly
  accessible for a student project, so `replay.py` replays held-out test
  data (the model never saw it during training) in time order. In
  production this would be a real-time event stream (e.g. Kafka) from
  the bank's core systems.
- **Network View's "rings" are a heuristic, not GNN-based.** It groups
  accounts that share a high-risk transaction using simple connected
  components — not a trained graph neural network. Real GNN-based ring
  detection is a planned next step, not yet built.
- **SHAP explanations are real**, computed by `shap.TreeExplainer` against
  the actual trained RandomForest — this part is not a heuristic.
- **No authentication.** Every action is attributed to a hardcoded
  analyst name ("S. Patil"). A real system would authenticate the analyst
  and use their real identity.
- **SQLite, not a production database.** Good enough for a demo/portfolio
  project; a real deployment would likely use PostgreSQL.

## Possible next steps

- Real GNN-based fraud ring detection (PyTorch Geometric)
- Basic authentication so actions attribute to the real logged-in analyst
- Autoencoder-based anomaly detection as a second model alongside the classifier
- Move from SQLite to PostgreSQL for the actions store
# FraudLens

A real-time, explainable fraud detection platform for a fictional bank
(**NovaBank**). Detects suspicious transactions using a trained ML model,
explains every flag with real SHAP values, groups high-risk transactions
into potential fraud rings, and streams everything to a live dashboard.

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
  as false positive) — persisted and broadcast to every open page
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
backend/node (Express + Socket.io)  ---->  POST /api/predict, /api/actions
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
| ML API | Flask + flask-cors |
| Backend | Node.js, Express, Socket.io |
| Frontend | Vanilla HTML/CSS/JS, Chart.js (no framework, no build step) |
| Live feed | Custom replay script over the held-out test set |

## Folder structure

```
FraudLens/
├── data/
│   ├── raw/paysim.csv           <- download from Kaggle, place here
│   └── processed/{train,test}.csv
├── ml/
│   ├── notebooks/preprocessing.ipynb   <- EDA, feature engineering, split, training
│   ├── preprocessing.py         <- shared feature-engineering logic
│   ├── train.py                 <- standalone training script (alternative to the notebook)
│   ├── predict.py               <- inference + SHAP explanation
│   ├── replay.py                <- live-stream simulator
│   └── model/*.pkl              <- trained model artifacts
├── backend/
│   ├── ml_service/              <- Flask API wrapping predict.py
│   │   ├── app.py
│   │   └── requirements.txt
│   └── node/                    <- Express API + Socket.io
│       ├── src/
│       │   ├── index.js
│       │   ├── routes/{predict,actions}.js
│       │   └── services/mlService.js
│       └── package.json
└── frontend/
    ├── server.js                 <- static file server (localhost:3000)
    ├── package.json
    └── public/
        ├── index.html             <- Live Monitor
        ├── transaction.html       <- Transaction Detail (SHAP explanations)
        ├── network.html           <- Network View (fraud rings)
        ├── rules.html             <- Alerts & Rules
        ├── css/style.css
        └── js/live-store.js       <- shared Socket.io + localStorage data layer
```

## Setup — from scratch

1. **Get the data**: download `paysim.csv` from
   [Kaggle](https://www.kaggle.com/datasets/ealaxi/paysim1), place it at
   `data/raw/paysim.csv`
2. **Run preprocessing + training**: open `ml/notebooks/preprocessing.ipynb`,
   restart the kernel, Run All. This produces `data/processed/{train,test}.csv`
   and `ml/model/*.pkl`
3. **Install Python dependencies**:
   ```
   cd backend/ml_service
   pip install -r requirements.txt
   ```
4. **Install Node dependencies**:
   ```
   cd backend/node && npm install
   cd ../../frontend && npm install
   ```

## Running it (4 terminals)

| Terminal | Command | Runs on |
|---|---|---|
| 1 | `cd backend/ml_service && python app.py` | localhost:5001 |
| 2 | `cd backend/node && npm start` | localhost:5000 |
| 3 | `cd frontend && npm start` | localhost:3000 |
| 4 | `cd ml && python replay.py --demo --force-rings --speed 0.3` | — |

Open **http://localhost:3000** in your browser once terminals 1-3 are running,
*then* start the replay in terminal 4.

Useful replay flags:
- `--demo` — curated mix guaranteeing some fraud cases show up (plain
  replay can easily show zero fraud, since it's only ~0.13% of the data)
- `--force-rings` — guarantees ring-forming transactions are included, so
  Network View has something to show
- `--speed 0.1` — fast playback for a live demo
- `--limit N` — replay only the first N transactions

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
- **In-memory storage.** Analyst actions (Hold/Review/False positive) are
  stored in Node's memory and reset when the server restarts — not a
  real database yet.
- **Flask's dev server** shows a "do not use in production" warning by
  design — a real deployment would use Gunicorn/Waitress behind a proper
  web server.

## Possible next steps

- Real GNN-based fraud ring detection (PyTorch Geometric)
- Persistent storage for actions (SQLite/PostgreSQL) instead of in-memory
- Basic authentication so actions attribute to the real logged-in analyst
- Autoencoder-based anomaly detection as a second model alongside the classifier
- Deploy the full stack (Render.com, or similar)
"""
FraudLens — ML Service (Flask)
---------------------------------
Thin HTTP wrapper around ml/predict.py, so the Node.js backend can get
a fraud prediction over HTTP instead of running Python itself.

Local run:
    cd backend/ml_service
    pip install -r requirements.txt
    python app.py

Production (Render, etc.):
    gunicorn app:app
    (PORT is read from the environment automatically; see Procfile)

Then Node calls: POST <this service's URL>/predict
"""

import os
import sys
from pathlib import Path

# ml/ is a sibling of backend/, so: backend/ml_service/app.py -> ../../ml
ML_DIR = Path(__file__).resolve().parent.parent.parent / "ml"
sys.path.append(str(ML_DIR))

from flask import Flask, request, jsonify
from flask_cors import CORS
from predict import predict_transaction  # from ml/predict.py, via the sys.path append above

app = Flask(__name__)
CORS(app)  # allows the Node backend (running on a different host/port) to call this API

REQUIRED_FIELDS = [
    "step", "type", "amount", "nameOrig", "oldbalanceOrg",
    "newbalanceOrig", "nameDest", "oldbalanceDest", "newbalanceDest"
]


@app.route("/health", methods=["GET"])
def health():
    """Quick check that the service is up and the model loaded fine."""
    return jsonify({"status": "ok"})


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(silent=True)

    if data is None:
        return jsonify({"error": "Request body must be JSON"}), 400

    missing = [f for f in REQUIRED_FIELDS if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {missing}"}), 400

    try:
        result = predict_transaction(data)
    except Exception as e:
        # Don't leak internals in production — this is fine for now
        # while developing, but tighten before a real deployment.
        return jsonify({"error": str(e)}), 500

    return jsonify(result)


if __name__ == "__main__":
    # PORT comes from the environment on Render (and most PaaS hosts);
    # falls back to 5001 for local development.
    port = int(os.environ.get("PORT", 5001))
    # Debug/reloader off by default — only turn it on locally by setting
    # FLASK_DEBUG=1, since Flask's debugger should never run in production.
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
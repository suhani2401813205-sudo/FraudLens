import joblib
import pandas as pd
from pathlib import Path

from preprocessing import preprocess_transaction


# __file__-based paths: work no matter where the script is run from,
# and no matter which folder predict.py itself lives in — only its
# position relative to model/ matters. Adjust the number of .parent
# calls if you move predict.py to a different folder depth.
BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "ml" / "model" / "fraud_model.pkl"
FEATURES_PATH = BASE_DIR / "ml" / "model" / "feature_columns.pkl"
THRESHOLD_PATH = BASE_DIR / "ml" / "model" / "threshold.pkl"

model = joblib.load(MODEL_PATH)
feature_columns = joblib.load(FEATURES_PATH)
threshold = joblib.load(THRESHOLD_PATH)


def predict_transaction(data):

    # Preprocess transaction
    X = preprocess_transaction(data)

    # Make columns identical to training
    X = X.reindex(
        columns=feature_columns,
        fill_value=0
    )

    # Fraud probability
    probability = model.predict_proba(X)[0][1]

    # Final prediction
    prediction = int(probability >= threshold)

    return {
        "prediction": "Fraud" if prediction == 1 else "Normal",
        "fraud_probability": round(float(probability), 6),
        "risk_score": round(float(probability * 100), 2)
    }
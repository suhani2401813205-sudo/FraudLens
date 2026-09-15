import joblib
import pandas as pd

from preprocessing import preprocess_transaction


MODEL_PATH = "../model/fraud_model.pkl"
FEATURES_PATH = "../model/feature_columns.pkl"
THRESHOLD_PATH = "../model/threshold.pkl"

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
import joblib
import shap
import pandas as pd
from pathlib import Path

from preprocessing import preprocess_transaction


# predict.py lives in ml/, model/ is right next to it — this works
# no matter where the script is *run* from (CWD doesn't matter).
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model" / "fraud_model.pkl"
FEATURES_PATH = BASE_DIR / "model" / "feature_columns.pkl"
THRESHOLD_PATH = BASE_DIR / "model" / "threshold.pkl"

model = joblib.load(MODEL_PATH)
feature_columns = joblib.load(FEATURES_PATH)
threshold = joblib.load(THRESHOLD_PATH)

# TreeExplainer is fast and exact for tree-based models like RandomForest —
# built once at import time so every prediction reuses it instead of
# rebuilding an explainer per request.
explainer = shap.TreeExplainer(model)

# Human-readable labels for each engineered/raw feature, so the frontend
# can show "Sender account emptied" instead of a raw column name like
# "balance_change_orig". Keep this in sync with preprocessing.py's output columns.
FEATURE_LABELS = {
    "step": "Transaction hour (step)",
    "amount": "Transaction amount",
    "oldbalanceOrg": "Sender balance before",
    "newbalanceOrig": "Sender balance after",
    "oldbalanceDest": "Receiver balance before",
    "newbalanceDest": "Receiver balance after",
    "balance_change_orig": "Change in sender's balance",
    "balance_change_dest": "Change in receiver's balance",
    "orig_balance_error": "Mismatch: amount vs. sender balance change",
    "dest_balance_error": "Mismatch: amount vs. receiver balance change",
    "type_CASH_IN": "Transaction type: Cash-in",
    "type_CASH_OUT": "Transaction type: Cash-out",
    "type_DEBIT": "Transaction type: Debit",
    "type_PAYMENT": "Transaction type: Payment",
    "type_TRANSFER": "Transaction type: Transfer",
}

TOP_N_FEATURES = 5


def explain_prediction(X):
    """Return the top contributing features (SHAP values) for the FRAUD
    class (class index 1), sorted by absolute impact. Each entry has the
    feature's raw value and its signed SHAP contribution — positive
    pushes the prediction toward fraud, negative pushes it toward normal.
    """
    shap_values = explainer.shap_values(X)  # shape: (1, n_features, 2)
    fraud_shap = shap_values[0, :, 1]

    contributions = [
        {
            "feature": col,
            "label": FEATURE_LABELS.get(col, col),
            "value": float(X.iloc[0][col]),
            "shap_value": float(fraud_shap[i]),
        }
        for i, col in enumerate(feature_columns)
    ]

    contributions.sort(key=lambda c: abs(c["shap_value"]), reverse=True)
    return contributions[:TOP_N_FEATURES]


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
        "risk_score": round(float(probability * 100), 2),
        "shap_explanation": explain_prediction(X),
    }
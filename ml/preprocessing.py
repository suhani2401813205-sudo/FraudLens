import pandas as pd


ENGINEERED_FEATURES = [
    "balance_change_orig",
    "balance_change_dest",
    "orig_balance_error",
    "dest_balance_error"
]


def preprocess_transaction(data):
    """
    Preprocess one transaction (a dict) the same way
    as the training dataset. Used at prediction time.
    """
    df = pd.DataFrame([data])
    return preprocess_dataframe(df)


def preprocess_dataframe(df):
    """
    Same feature engineering as preprocess_transaction, but for a full
    dataframe (many rows) instead of a single transaction. Used during
    training, so train and predict never drift apart.
    """
    df = df.copy()

    # Feature engineering
    df["balance_change_orig"] = (
        df["oldbalanceOrg"] - df["newbalanceOrig"]
    )

    df["balance_change_dest"] = (
        df["newbalanceDest"] - df["oldbalanceDest"]
    )

    df["orig_balance_error"] = (
        df["amount"] - df["balance_change_orig"]
    )

    df["dest_balance_error"] = (
        df["amount"] - df["balance_change_dest"]
    )

    # Remove account IDs
    df = df.drop(
        columns=["nameOrig", "nameDest"],
        errors="ignore"
    )

    # One-hot encode transaction type
    df = pd.get_dummies(
        df,
        columns=["type"],
        dtype=int
    )

    return df
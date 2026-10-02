"""
FraudLens — Live Stream Replay
---------------------------------
Reads the held-out test set (data the model never saw during training)
and replays it row by row, in time order, to the Node backend's
/api/predict endpoint — simulating a live transaction feed.

This is NOT a real live feed (no bank data is publicly accessible for
a student project). It's a transparent stand-in: in production this
replay loop would be replaced by a real-time event stream (e.g. Kafka)
from the bank's core banking system.

Usage:
    python replay.py                      # default: 1 step = 2 seconds
    python replay.py --speed 0.5          # faster: 1 step = 0.5 seconds
    python replay.py --limit 100          # only replay first 100 rows (in time order)
    python replay.py --demo               # curated mix: guarantees some fraud cases show up
    python replay.py --demo --demo-fraud 10 --demo-normal 40
    python replay.py --demo --force-rings # also guarantees ring-forming transactions are included
    python replay.py --loop               # keep replaying on repeat until Ctrl+C
    python replay.py --export out.csv     # write the curated/selected set to a CSV instead of replaying
    python replay.py --node-url http://localhost:5000
"""

import argparse
import os
import sys
import time
import requests
import pandas as pd
from pathlib import Path

# Make console output safe on Windows terminals using legacy codepages
# (cp1252 etc. can't encode certain Unicode characters and will crash
# the whole script mid-run) — reconfigure to UTF-8 where possible.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "test.csv"

# Only the raw fields the Node /api/predict endpoint (and predict.py
# underneath it) actually needs — test.csv may carry extra engineered
# columns from the preprocessing notebook that aren't part of the
# transaction itself.
TRANSACTION_FIELDS = [
    "step", "type", "amount", "nameOrig", "oldbalanceOrg", "newbalanceOrig",
    "nameDest", "oldbalanceDest", "newbalanceDest"
]


def load_test_stream(path=None):
    data_path = Path(path) if path else DATA_PATH
    df = pd.read_csv(data_path)
    missing = [f for f in TRANSACTION_FIELDS if f not in df.columns]
    if missing:
        raise ValueError(f"{data_path.name} is missing expected columns: {missing}")

    df = df.sort_values("step").reset_index(drop=True)
    return df


def build_demo_stream(df, n_fraud=10, n_normal=40, seed=42, force_rings=False):
    """Curate a small, demo-friendly mix instead of a plain top-N slice.

    Fraud is only ~0.13% of the data, so a plain `--limit 100` on a
    step-sorted file can easily show zero fraud cases — technically
    correct, but a weak demo. This guarantees a mix of real fraud and
    real normal transactions (still genuine held-out data, not fake),
    replayed in time order so it still reads as a coherent stream.

    force_rings=True additionally guarantees that any fraud transactions
    sharing an account with another fraud transaction (the only way the
    Network View's heuristic can form a "ring") are included — otherwise
    a plain random sample can easily miss the handful of rows that
    actually connect, since they're a small fraction even of the fraud
    rows.
    """
    fraud_rows = df[df["isFraud"] == 1]
    normal_rows = df[df["isFraud"] == 0]

    ring_rows = pd.DataFrame()
    if force_rings:
        accounts = pd.concat([fraud_rows["nameOrig"], fraud_rows["nameDest"]])
        repeated_accounts = set(accounts.value_counts()[lambda s: s > 1].index)
        if repeated_accounts:
            ring_mask = fraud_rows["nameOrig"].isin(repeated_accounts) | fraud_rows["nameDest"].isin(repeated_accounts)
            ring_rows = fraud_rows[ring_mask]
            print(f"Ring-focused mode: found {len(ring_rows)} fraud transactions "
                  f"across {len(repeated_accounts)} account(s) that repeat - including all of them.")
        else:
            print("Ring-focused mode: no repeated accounts found among fraud rows - no rings possible with this data.")

    remaining_fraud_needed = max(n_fraud - len(ring_rows), 0)
    fraud_pool = fraud_rows.drop(ring_rows.index)
    fraud_sample = fraud_pool.sample(n=min(remaining_fraud_needed, len(fraud_pool)), random_state=seed)
    normal_sample = normal_rows.sample(n=min(n_normal, len(normal_rows)), random_state=seed)

    demo_df = pd.concat([ring_rows, fraud_sample, normal_sample]).sort_values("step").reset_index(drop=True)
    total_fraud = len(ring_rows) + len(fraud_sample)
    print(f"Demo mode: curated {len(demo_df)} transactions "
          f"({total_fraud} fraud, {len(normal_sample)} normal), in time order.\n")
    return demo_df


def replay(df, node_url, seconds_per_step):
    total = len(df)
    print(f"Replaying {total} transactions from test.csv to {node_url} ...")
    print(f"Ground truth (isFraud) is tracked here for your own comparison only - "
          f"it is NOT sent to the API, since a real live feed wouldn't have it.\n")

    last_step = None
    sent, flagged, errors = 0, 0, 0

    for _, row in df.iterrows():
        if last_step is not None:
            gap = max(row["step"] - last_step, 0)
            time.sleep(gap * seconds_per_step)
        last_step = row["step"]

        transaction = {field: row[field] for field in TRANSACTION_FIELDS}
        transaction = {k: (v.item() if hasattr(v, "item") else v) for k, v in transaction.items()}

        actual_fraud = bool(row.get("isFraud", 0))

        try:
            response = requests.post(f"{node_url}/api/predict", json=transaction, timeout=60)
            response.raise_for_status()
            result = response.json()
            sent += 1

            predicted = result.get("prediction", "?")
            risk = result.get("risk_score", "?")
            if predicted == "Fraud":
                flagged += 1

            # ASCII-only markers (no Unicode checkmarks) so this never
            # crashes on Windows terminals using a legacy codepage (cp1252).
            match = "OK" if (predicted == "Fraud") == actual_fraud else "MISS"
            print(f"[step {row['step']:>3}] {transaction['nameOrig']} -> {transaction['nameDest']} "
                  f"| amount={transaction['amount']:.2f} | predicted={predicted} (risk={risk}) "
                  f"| actual_fraud={actual_fraud} [{match}]")

        except requests.exceptions.RequestException as e:
            errors += 1
            print(f"[step {row['step']:>3}] ERROR calling Node backend: {e}")

    print(f"\nDone. Sent: {sent}, Flagged as fraud: {flagged}, Errors: {errors}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--node-url", default=os.environ.get("NODE_URL", "http://localhost:5000"),
                         help="Base URL of the Node backend")
    parser.add_argument("--speed", type=float, default=2.0,
                         help="Seconds of real time per simulated hour (step). Lower = faster playback.")
    parser.add_argument("--limit", type=int, default=None,
                         help="Only replay the first N transactions, in time order (ignored if --demo is set)")
    parser.add_argument("--demo", action="store_true",
                         help="Curated mix guaranteeing some fraud cases - use this for presentations")
    parser.add_argument("--demo-fraud", type=int, default=10,
                         help="Number of fraud cases to include in --demo mode")
    parser.add_argument("--demo-normal", type=int, default=40,
                         help="Number of normal cases to include in --demo mode")
    parser.add_argument("--force-rings", action="store_true",
                         help="With --demo: guarantee any ring-forming fraud transactions are included, "
                              "so the Network View has something to show")
    parser.add_argument("--file", type=str, default=None,
                         help="Use a different CSV than data/processed/test.csv")
    parser.add_argument("--export", type=str, default=None,
                         help="Write the curated/selected transaction set to this CSV path instead of replaying")
    parser.add_argument("--loop", action="store_true",
                         help="Keep replaying the same curated set on repeat, until Ctrl+C - "
                              "handy for a demo/booth where you don't want to keep re-running the command")
    args = parser.parse_args()

    df = load_test_stream(args.file)

    if args.demo:
        df = build_demo_stream(df, n_fraud=args.demo_fraud, n_normal=args.demo_normal,
                                force_rings=args.force_rings)
    elif args.limit:
        df = df.head(args.limit)

    if args.export:
        df.to_csv(args.export, index=False)
        print(f"Exported {len(df)} transactions to {args.export}")
        return

    if args.loop:
        print("Loop mode: replaying continuously until you press Ctrl+C.\n")
        try:
            while True:
                replay(df, args.node_url, args.speed)
        except KeyboardInterrupt:
            print("\nStopped.")
    else:
        replay(df, args.node_url, args.speed)


if __name__ == "__main__":
    main()
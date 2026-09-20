import pandas as pd

df = pd.read_csv("data/processed/test.csv")
fraud = df[df["isFraud"] == 1]
print("Total fraud rows:", len(fraud))

# An account appearing in 2+ fraud transactions is what lets the
# Network View's connected-components heuristic form a "ring"
accounts = pd.concat([fraud["nameOrig"], fraud["nameDest"]])
repeated = accounts.value_counts()
repeated = repeated[repeated > 1]

print("Accounts appearing in 2+ fraud transactions:", len(repeated))
if len(repeated):
    print(repeated.head(10))
else:
    print("\nNo shared accounts among fraud rows in this dataset — "
          "with real PaySim data, fraud accounts are often used only "
          "once each, so ring formation may genuinely be rare here.")
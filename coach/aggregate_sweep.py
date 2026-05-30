"""
aggregate_sweep.py — collapse the 25 sweep_*.json files into one ranked table.

    python aggregate_sweep.py [results_dir]

Picks the (alpha, floor) that maximises a combined score:
    score = state_recovery - annoyance   (decisiveness shown, not penalised)
"""
import os
import sys
import glob
import json

d = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SCRATCH", "./extras/results")
rows = []
for path in glob.glob(os.path.join(d, "sweep_*.json")):
    with open(path) as f:
        rows.append(json.load(f))

if not rows:
    print(f"no sweep_*.json found in {d}")
    sys.exit(0)

for r in rows:
    r["score"] = round(r["state_recovery_rate"] - r["annoyance_rate"], 4)
rows.sort(key=lambda r: r["score"], reverse=True)

print(f"\n{'alpha':>6} {'floor':>6} {'recovery':>9} {'annoy':>7} {'decisive':>9} {'score':>7}")
print("-" * 50)
for r in rows:
    print(f"{r['alpha']:>6} {r['floor']:>6} {r['state_recovery_rate']:>9} "
          f"{r['annoyance_rate']:>7} {r['decisive_fraction']:>9} {r['score']:>7}")
best = rows[0]
print(f"\nBEST: alpha={best['alpha']} floor={best['floor']} "
      f"(recovery={best['state_recovery_rate']}, annoy={best['annoyance_rate']})")
print("Note: a TUNING input, not a result. The chosen constants are still DESIGNED;")
print("the sweep finds them, it does not validate the coach against real users.")

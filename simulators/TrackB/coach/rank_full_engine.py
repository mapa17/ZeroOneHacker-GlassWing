"""
rank_full_engine.py — re-rank the (alpha, floor) grid on the TRUE failure
surface: full-engine precision/recall across the rich-noise band {0.1,0.2,0.3}.

Replaces the estimator proxy in leo_sweep, which rewarded peaked beliefs — the
exact mechanism behind precision leakage. Emits the precision/recall DIAL:
every config as a (recall, annoyance) operating point, Pareto frontier flagged.
"""
import os
import csv
import numpy as np
from robustness_sweep import run_level
from leo_sweep import ALPHAS, FLOORS

BAND = [0.1, 0.2, 0.3]
RUNS = 200


def evaluate(a, f):
    rs = [run_level(n, a, f, runs_per_seg=RUNS) for n in BAND]
    m = lambda k: round(float(np.mean([r[k] for r in rs])), 4)
    return {"alpha": a, "floor": f,
            "recall": m("hazard_save_rate"),
            "annoyance": m("annoyance_rate"),
            "judith_force": m("judith_force_rate"),
            "rec_at_risk": m("recovery_at_risk")}


grid = [evaluate(a, f) for a in ALPHAS for f in FLOORS]

# Pareto frontier: maximise recall, minimise annoyance
for p in grid:
    p["pareto"] = not any(
        (q["recall"] >= p["recall"] and q["annoyance"] <= p["annoyance"]
         and (q["recall"] > p["recall"] or q["annoyance"] < p["annoyance"]))
        for q in grid if q is not p)

scratch = os.environ.get("SCRATCH", "./extras/results")
os.makedirs(scratch, exist_ok=True)
with open(os.path.join(scratch, "dial_coordinates.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=["alpha", "floor", "recall", "annoyance",
                                       "judith_force", "rec_at_risk", "pareto"])
    w.writeheader()
    w.writerows(grid)

ranked = sorted(grid, key=lambda r: (r["annoyance"], -r["recall"]))
print(f"\n  full-engine re-rank — band-avg {BAND}, {RUNS} runs/seg "
      f"(proxy stripped)\n")
print(f"  {'alpha':>5} {'floor':>5} {'recall':>7} {'annoy':>7} "
      f"{'force':>6} {'rec@r':>6} {'pareto':>7}")
print("  " + "-" * 50)
for r in ranked:
    flag = " *" if r["pareto"] else ""
    print(f"  {r['alpha']:>5} {r['floor']:>5} {r['recall']:>7} {r['annoyance']:>7} "
          f"{r['judith_force']:>6} {r['rec_at_risk']:>6} {('yes'+flag) if r['pareto'] else 'no':>7}")

front = sorted([r for r in grid if r["pareto"]], key=lambda r: r["recall"])
print(f"\n  PARETO DIAL ({len(front)} settings) — slide from precision-max to recall-max:")
for r in front:
    print(f"    (alpha={r['alpha']}, floor={r['floor']})  recall={r['recall']}  "
          f"annoy={r['annoyance']}  force={r['judith_force']}")

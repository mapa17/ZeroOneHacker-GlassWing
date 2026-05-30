"""
leo_sweep.py — parameter variance sweep for the BayesianCoachEstimator.

Runs many noisy persona trajectories through the REAL coach pipeline
(event_to_likelihood -> estimator.update) across a grid of (alpha, floor)
to find values that maximise state-recovery and minimise annoyance.

Deterministic + no internet -> ideal Leonardo CPU batch job. OFF the demo
critical path: this only TUNES constants; the demo runs without it.

Run locally:   python leo_sweep.py 0.10 0.10
On Leonardo:   sbatch --array=0-24 run_sweep.sh
"""
import os
import sys
import json
import numpy as np

ALPHAS = [0.05, 0.10, 0.15, 0.20, 0.25]
FLOORS = [0.05, 0.10, 0.15, 0.20, 0.25]

# real pipeline — note the package paths
from coach.estimator import BayesianCoachEstimator
from coach.likelihood import event_to_likelihood
from fixtures.fake_signals import PERSONAS


def _noisy_events(events, rng, drop=0.05, jitter=0.15):
    """Inject within-persona variability: small chance to drop/duplicate an
    event (telemetry noise), and jitter dwell times (user variability).
    This is the within-cluster variance the deterministic scripts lack."""
    out = []
    for ev, truth in events:
        if rng.random() < drop:
            continue                                  # dropped signal
        ev = dict(ev)
        if "dwell_ms" in ev:
            ev["dwell_ms"] = max(500, int(ev["dwell_ms"] * (1 + rng.uniform(-jitter, jitter))))
        out.append((ev, truth))
    return out


def run_batch(alpha, floor, num_runs=1000, seed=42):
    rng = np.random.default_rng(seed)
    recovery_hits = 0
    recovery_total = 0
    annoyance_fired = 0
    annoyance_total = 0

    persona_keys = list(PERSONAS.keys())
    for _ in range(num_runs):
        name = persona_keys[rng.integers(len(persona_keys))]
        events, _seg = PERSONAS[name]
        est = BayesianCoachEstimator(alpha=alpha, floor=floor)

        for ev, truth in _noisy_events(events, rng):
            est.update(event_to_likelihood(ev))
            # state-recovery: top state matches injected truth (post-evidence only)
            if est.confidence >= 0.35:
                recovery_total += 1
                if est.top == truth:
                    recovery_hits += 1
            # annoyance: high confidence in an at-risk state while truth is NOT at-risk
            if est.confidence >= 0.35 and est.top in ("overwhelmed", "abandoning"):
                annoyance_total += 1
                if truth in ("ready", "orienting"):
                    annoyance_fired += 1

    return {
        "alpha": round(alpha, 3), "floor": round(floor, 3), "num_runs": num_runs,
        "state_recovery_rate": round(recovery_hits / recovery_total, 4) if recovery_total else 0.0,
        "annoyance_rate": round(annoyance_fired / annoyance_total, 4) if annoyance_total else 0.0,
        "decisive_fraction": round(recovery_total / max(1, num_runs * 6), 4),
    }


if __name__ == "__main__":
    alpha = float(sys.argv[1]) if len(sys.argv) > 1 else 0.10
    floor = float(sys.argv[2]) if len(sys.argv) > 2 else 0.10
    seed = int(os.environ.get("SLURM_ARRAY_TASK_ID", 42))

    result = run_batch(alpha, floor, num_runs=1000, seed=seed)

    scratch = os.environ.get("SCRATCH", "./extras/results")
    os.makedirs(scratch, exist_ok=True)
    task_id = os.environ.get("SLURM_ARRAY_TASK_ID", "local")
    path = os.path.join(scratch, f"sweep_a{alpha}_f{floor}_task{task_id}.json")
    with open(path, "w") as f:
        json.dump(result, f)
    print(json.dumps(result))

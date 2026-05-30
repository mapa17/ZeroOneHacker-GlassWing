"""
robustness_sweep.py — Stage 2 of the variance sweep.

Freezes the champion (alpha*, floor*) from Stage 1 and sweeps JITTER magnitude n
over NOISE_GRID, running each noisy trajectory through the FULL CoachEngine.

Honest metrics (no truncation/fire-rate confound):
  - hazard_save_rate  : on the at-risk ONLINE-TARGET cohort (Franz S2, Peter S3),
                        baseline is 0 by design (they drop without help). Counts
                        a real online save (non-handoff prompted/active fire).
                        DENOMINATOR = ground-truth hazard, NOT coach-detected.
  - judith_force_rate : restraint check on S1 (should stay low) — the coach must
                        NOT force the low-online-conversion segment.
  - recovery_at_risk  : inference accuracy on AT-RISK-truth events only (the
                        windows where the read actually drives an action). Early
                        orienting-vs-ready noise is out of scope by design.
  - recovery_global   : kept for transparency (the unfiltered number).
  - annoyance_rate    : non-handoff fire while truth is NOT at-risk (all personas).
  - scope_misroute    : in-scope journeys wrongly routed out-of-scope (noise error).

Stage 1 TUNES; Stage 2 MAPS the envelope. Synthetic personas (validity ceiling):
a measured envelope, not a guaranteed shape.

Run locally:   python robustness_sweep.py 0.10 0.10
On Leonardo:   sbatch --array=0-4 run_robust.sh
"""
import os
import sys
import json
import numpy as np

from coach.coach_engine import CoachEngine
from fixtures.fake_signals import PERSONAS
from jitter import NOISE_GRID, apply_jitter

AT_RISK = {"overwhelmed", "abandoning"}
NOT_AT_RISK = {"ready", "orienting"}
CONV_TARGET_SEGS = {"S2", "S3"}     # online-conversion-target segments (Franz, Peter)


def _run_on(events, alpha, floor):
    """Run the coach over a trajectory. Returns (recs, real_save, routed).
    real_save = a non-handoff prompted/active fire happened (online retention)."""
    eng = CoachEngine(alpha=alpha, floor=floor)
    recs, real_save = [], False
    for ev, truth in events:
        a = eng.process(ev)
        recs.append({"truth": truth, "inferred": eng.est.top,
                     "tier": a["action_tier"], "channel": a["channel"]})
        if a["action_tier"] in ("prompted", "active") and a["channel"] != "handoff":
            real_save = True
    return recs, real_save, eng.routed_out_of_scope


def run_level(n, alpha, floor, runs_per_seg=400, seed=42):
    rng = np.random.default_rng(seed + int(round(n * 1000)))
    save_tot = save_hit = 0          # hazard-save cohort (S2, S3)
    force_tot = force_hit = 0        # restraint cohort (S1)
    win_tot = win_hit = 0            # at-risk-window recovery
    glob_tot = glob_hit = 0          # global recovery (transparency)
    annoy_tot = annoy_hit = 0
    scope_misroute = errors = 0

    for _name, (events, seg) in PERSONAS.items():
        base_at_risk = any(tr in AT_RISK for _ev, tr in events)
        is_target = base_at_risk and seg in CONV_TARGET_SEGS
        is_restraint = base_at_risk and seg not in CONV_TARGET_SEGS
        for _ in range(runs_per_seg):
            noisy = apply_jitter(events, n, rng)
            try:
                recs, real_save, routed = _run_on(noisy, alpha, floor)
            except Exception:
                errors += 1
                continue
            if is_target:                         # baseline 0 by design; did coach save online?
                save_tot += 1
                if real_save:
                    save_hit += 1
            if is_restraint:                      # should NOT fire on her
                force_tot += 1
                if real_save:
                    force_hit += 1
            for r in recs:
                glob_tot += 1
                if r["inferred"] == r["truth"]:
                    glob_hit += 1
                if r["truth"] in AT_RISK:         # windowed (decision-critical) recovery
                    win_tot += 1
                    if r["inferred"] == r["truth"]:
                        win_hit += 1
            for r in recs:
                if r["tier"] in ("prompted", "active") and r["channel"] != "handoff":
                    annoy_tot += 1
                    if r["truth"] in NOT_AT_RISK:
                        annoy_hit += 1
            if routed:
                scope_misroute += 1

    return {
        "n": round(n, 3), "alpha": alpha, "floor": floor,
        "hazard_save_rate": round(save_hit / max(1, save_tot), 4),
        "judith_force_rate": round(force_hit / max(1, force_tot), 4),
        "recovery_at_risk": round(win_hit / max(1, win_tot), 4),
        "recovery_global": round(glob_hit / max(1, glob_tot), 4),
        "annoyance_rate": round(annoy_hit / max(1, annoy_tot), 4),
        "scope_misroute_rate": round(scope_misroute / max(1, save_tot + force_tot), 4),
        "engine_errors": errors,
    }


def main():
    alpha = float(sys.argv[1]) if len(sys.argv) > 1 else 0.10
    floor = float(sys.argv[2]) if len(sys.argv) > 2 else 0.10
    runs = int(os.environ.get("RUNS_PER_SEG", "400"))

    task = os.environ.get("SLURM_ARRAY_TASK_ID")
    grid = ([NOISE_GRID[int(task)]] if task is not None and task.isdigit()
            and int(task) < len(NOISE_GRID) else NOISE_GRID)
    rows = [run_level(n, alpha, floor, runs_per_seg=runs) for n in grid]

    scratch = os.environ.get("SCRATCH", "./extras/results")
    os.makedirs(scratch, exist_ok=True)
    for r in rows:
        with open(os.path.join(scratch, f"robust_n{r['n']}.json"), "w") as f:
            json.dump(r, f)

    print(f"\n  champion alpha={alpha} floor={floor}  ({runs} runs/seg)  "
          f"baseline conv (at-risk cohort) = 0.0 by design\n")
    print(f"  {'n':>4} {'save_rate':>10} {'judith_force':>13} "
          f"{'rec@risk':>9} {'rec_glob':>9} {'annoy':>7} {'scope':>6} {'err':>4}")
    print("  " + "-" * 70)
    for r in rows:
        print(f"  {r['n']:>4} {r['hazard_save_rate']:>10} {r['judith_force_rate']:>13} "
              f"{r['recovery_at_risk']:>9} {r['recovery_global']:>9} "
              f"{r['annoyance_rate']:>7} {r['scope_misroute_rate']:>6} {r['engine_errors']:>4}")
    print("\n  save_rate: at-risk online-target cohort (Franz+Peter), vs 0.0 baseline")
    print("  denominator = ground-truth hazard, NOT coach-detected (no inflation)\n")


if __name__ == "__main__":
    main()

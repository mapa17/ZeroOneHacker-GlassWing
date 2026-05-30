"""
eval_harness.py — the PROOF layer. Runs each persona with the coach OFF
(baseline) and ON, on identical scripted journeys, and computes the five
rubric metrics. Writes results to extras/results/.

Metrics (all inherit the validity ceiling — they describe the MODEL, not
customers; see METHODOLOGY.md):
  1. State-recovery rate  — coach's inferred top-state vs the injected truth
  2. Conversion uplift    — ON vs OFF, per persona (per-persona dual metric)
  3. Drop-off reduction   — attrition delta at the persona's critical step
  4. Inference precision/recall — catching abandonment before the exit event
  5. Annoyance rate       — interventions fired on non-at-risk (ready/orienting) users

Deterministic. No LLM, no network.
"""
import csv
import os
from coach.coach_engine import CoachEngine
from fixtures.fake_signals import PERSONAS

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "extras", "results")

# per-persona: does a save_progress/handoff count as conversion success?
# from personas.json best_coach_interventions (see interfaces.md §4)
QUALIFIED_OK = {"S1": True, "S2": False, "S3": True}
AT_RISK_STATES = {"overwhelmed", "abandoning"}
NOT_AT_RISK = {"ready", "orienting"}


def _run_once(events, coach_on: bool):
    """Run one journey. Returns per-event records + whether it 'converted'."""
    eng = CoachEngine() if coach_on else None
    recs = []
    saved = False           # did an ON-coach intervention retain the user?
    for ev, truth in events:
        if coach_on:
            a = eng.process(ev)
            recs.append({"truth": truth, "inferred": eng.est.top,
                         "tier": a["action_tier"], "channel": a["channel"],
                         "step": ev.get("step")})
            if a["action_tier"] in ("prompted", "active"):
                saved = True
        else:
            recs.append({"truth": truth, "inferred": None,
                         "tier": "silent", "channel": "none",
                         "step": ev.get("step")})
    # baseline: a journey ending in abandoning/overwhelmed = drop.
    # ON: a well-timed intervention on an at-risk user = a 'save'.
    ended_at_risk = events[-1][1] in AT_RISK_STATES
    converted = (not ended_at_risk) or (coach_on and saved)
    return recs, converted


def evaluate():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    rows = []
    for name, (events, seg) in PERSONAS.items():
        off_recs, off_conv = _run_once(events, coach_on=False)
        on_recs, on_conv = _run_once(events, coach_on=True)

        # 1. state-recovery rate (ON only — needs an inference)
        hits = sum(1 for r in on_recs if r["inferred"] == r["truth"])
        recovery = hits / len(on_recs)

        # 3. drop-off at the final at-risk event: did coach act before the end?
        acted_before_exit = any(r["tier"] in ("prompted", "active") for r in on_recs[:-1])

        # 4. precision/recall on abandonment detection (before final exit event)
        pred_aband = [r["inferred"] == "abandoning" for r in on_recs]
        true_aband = [r["truth"] == "abandoning" for r in on_recs]
        tp = sum(1 for p, t in zip(pred_aband, true_aband) if p and t)
        fp = sum(1 for p, t in zip(pred_aband, true_aband) if p and not t)
        fn = sum(1 for p, t in zip(pred_aband, true_aband) if t and not p)
        precision = tp / (tp + fp) if (tp + fp) else 1.0
        recall = tp / (tp + fn) if (tp + fn) else 1.0

        # 5. annoyance: interventions fired while user was NOT at risk
        fired = [r for r in on_recs if r["tier"] in ("prompted", "active")]
        annoy = sum(1 for r in fired if r["truth"] in NOT_AT_RISK)
        annoyance = annoy / len(fired) if fired else 0.0

        rows.append({
            "persona": name, "segment": seg,
            "converted_OFF": int(off_conv), "converted_ON": int(on_conv),
            "uplift": int(on_conv) - int(off_conv),
            "qualified_counts_handoff": QUALIFIED_OK[seg],
            "state_recovery": round(recovery, 2),
            "acted_before_exit": int(acted_before_exit),
            "abandon_precision": round(precision, 2),
            "abandon_recall": round(recall, 2),
            "annoyance_rate": round(annoyance, 2),
        })

    # write CSV
    path = os.path.join(RESULTS_DIR, "eval_summary.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # console report
    print(f"\n{'='*70}\n  EVAL — coach OFF vs ON  (model-level; validity ceiling applies)\n{'='*70}")
    for r in rows:
        print(f"\n{r['persona'].upper()} ({r['segment']})")
        print(f"  conversion:   OFF={r['converted_OFF']}  ON={r['converted_ON']}  "
              f"uplift={r['uplift']:+d}  (handoff counts: {r['qualified_counts_handoff']})")
        print(f"  state-recovery: {r['state_recovery']}   acted-before-exit: {bool(r['acted_before_exit'])}")
        print(f"  abandon P/R:  {r['abandon_precision']}/{r['abandon_recall']}   "
              f"annoyance: {r['annoyance_rate']}")

    n = len(rows)
    print(f"\n{'-'*70}")
    print(f"  TOTALS: conversions OFF={sum(r['converted_OFF'] for r in rows)}/{n}  "
          f"ON={sum(r['converted_ON'] for r in rows)}/{n}  "
          f"| mean annoyance={sum(r['annoyance_rate'] for r in rows)/n:.2f}")
    print(f"  written -> {path}\n")
    return rows


if __name__ == "__main__":
    evaluate()

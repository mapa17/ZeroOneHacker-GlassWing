"""
run_demo.py — the demo spine. Runs a persona's scripted journey through the
coach and prints the belief evolving + the action fired at each step.

    python run_demo.py --persona franz
    python run_demo.py --persona all

Standalone: depends only on coach/ + fixtures/. No web layer, no LLM, no network.
"""
import argparse
from coach import BayesianCoachEstimator, event_to_likelihood, decide
from fixtures.fake_signals import PERSONAS


def infer_seg_lean(history):
    """Crude trajectory-based segment lean — derived from belief history, never
    from a label. Placeholder heuristic for the demo; refine later."""
    states = [h["top"] for h in history]
    steps = [h["step"] for h in history]
    if "overwhelmed" in states[:3]:
        return "S3"   # early overwhelm -> Peter-like
    if states and states[-1] == "abandoning" and steps and steps[-1] == "finalprice":
        return "S2"   # late abandon at final price -> Franz-like
    if "abandoning" in states and "tariff" in steps:
        return "S1"   # abandon around tariff/advisory -> Judith-like
    return None


def run(name, events):
    est = BayesianCoachEstimator()
    history = []
    print(f"\n{'='*68}\n  {name.upper()}\n{'='*68}")
    for ev, truth in events:
        est.update(event_to_likelihood(ev))
        history.append({"top": est.top, "step": ev.get("step")})
        seg = infer_seg_lean(history)
        price_gap = ev.get("step") == "finalprice"
        action = decide(est, ev.get("step"), seg, price_gap)

        b = est.as_dict()
        bar = "  ".join(f"{k[:4]}={v:.2f}" for k, v in b.items())
        tier = action["action_tier"]
        mark = "  " if tier == "silent" else "->"
        print(f"\n[{ev.get('step','?'):10}] {ev['event_type']:11} "
              f"(truth:{truth})")
        print(f"   belief: {bar}")
        print(f"   infer:  top={est.top:11} conf={est.confidence:.2f} seg~{seg}")
        print(f" {mark}action: {tier:8} {action['channel']}")
        if action["message"]:
            print(f"           \"{action['message']}\"")
        print(f"           reason: {action['reason']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--persona", default="all",
                    choices=["all", "franz", "judith", "peter"])
    args = ap.parse_args()
    targets = PERSONAS.keys() if args.persona == "all" else [args.persona]
    for name in targets:
        events, _ = PERSONAS[name]
        run(name, events)
    print()


if __name__ == "__main__":
    main()

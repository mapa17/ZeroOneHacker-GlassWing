# Track B — Conversion Coach (deterministic proof lane)

Python-only artifact: a behaviour-only Bayesian state estimator + transparent policy
that keeps at-risk users completing the UNIQA insurance form **online**. No web app,
no UI — this is the reproducible proof.

## Run
```
cd coach
python -m pytest .. -q
python run_demo.py --persona peter
python rank_full_engine.py        # builds the precision/recall dial
```

- Conversion = online completion only; a handoff is a scope-exit, never a conversion.
- Reads behaviour only (dwell, back-clicks, selections, hover targets) — never a label.
- Verified: pytest green, 0 crashes / 0% mis-routes across 6,000 noisy trajectories.

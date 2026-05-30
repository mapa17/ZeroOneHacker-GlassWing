# Architecture — Glass Wing Conversion Coach

## The pipeline

```
 LLM persona (teammate #2)              ┌──────────────── COACH (our lane) ────────────────┐
 behaves in-character, emits             │                                                   │
 telemetry — NEVER its own label         │   coach_engine.py    validate §1 → … → §2 action  │
        │                                │        │  (never raises; degrades to safe no-op)   │
        ▼                                │        ▼                                           │
 ┌───────────────┐   §1 signal event     │   likelihood.py     event → P(signal|state) vec    │
 │  web/journey  │ ────────────────────► │        │            (hand-set matrix, dwell-binned) │
 │ (teammate #1) │                       │        ▼                                           │
 │ 9-step form   │ ◄──────────────────── │   estimator.py      Bayesian belief over 5 states  │
 │  + chat win   │   §2 action object    │        │            (THE WALL: stat-blind)          │
 └───────────────┘                       │        ▼                                           │
                                         │   policy.py         state+conf+step+seg → action   │
                                         │                     + reason + support_tone         │
                                         └───────────────────────────────────────────────────┘
                                                  │
                              eval_harness.py ◄───┘   OFF vs ON → 5 metrics → extras/results/
                              leo_sweep.py            parameter sweep (Leonardo, off-path)
```

## Modules (our lane)

| File | Role | Key property |
|---|---|---|
| `coach/coach_engine.py` | Entry point. Validates §1 in, runs pipeline, guarantees §2 out. | **Never raises** — bad input → safe silent no-op. Enforces THE WALL at the boundary. |
| `coach/estimator.py` | Bayesian belief vector over 5 states. | **Stat-blind.** Floor (anti-collapse) + decay (responsive). Sums to 1. |
| `coach/likelihood.py` | Maps a signal event → `P(signal\|state)` vector. | Hand-set matrix; dwell log-binned on *ratio to step baseline* (defends annoyance). |
| `coach/policy.py` | Inferred state → action tier + reason + support_tone. | Silence is first-class. Segment priors `[DESIGNED]`, response-layer only. Graceful-exit rule. |
| `eval_harness.py` | OFF vs ON comparison → the 5 rubric metrics. | Per-persona dual metric (handoff counts for S1/S3, not S2). |
| `leo_sweep.py` + `run_sweep.sh` | Parameter variance sweep on Leonardo. | CPU, deterministic, **off the demo critical path**. Tuning, not validation. |
| `fixtures/fake_signals.py` | STUB for teammate #2's personas. | Three scripted journeys; **no labels in the stream**. |
| `run_demo.py` | Standalone demo spine. | Zero dependency on web/LLM/network. |

## The five states (coding scheme)

Distinguished by **action-distinctness** — two states that trigger the same response collapse into one.

| State | Coach response | Tone |
|---|---|---|
| orienting | ambient / low pressure | low_pressure |
| evaluating | passive value cues | low_pressure |
| overwhelmed | simplify / offer human | warm_concrete |
| ready | stay out of the way | step_back |
| abandoning | earned interruption / save-progress | cold_factual (S2) / warm_exit |

## Two contracts (the parallel-build seam)

- **§1 signal event** (web → coach): `session_id, step, event_type, dwell_ms, nav_vector, target, value, edit_quality, history, chat_text`. **No segment/state label — enforced.**
- **§2 action object** (coach → web): `action_tier, channel, message, reason, belief, support_tone`. `reason` mandatory.

## The two walls (why results stay honest)

1. **THE WALL (estimator).** State is inferred from behaviour only; the estimator never reads `personas.json`, NPS, or any segment label. Identity emerges from the trajectory.
2. **The designed/inferred line (policy).** Segment stats (NPS, online-purchase-criterion) and emotional tone shape *how the coach responds* once a state is inferred — tagged `[DESIGNED]`, never presented as something the coach discovered.

## Update rule (the core math)

```
B_new[s]  ∝  B_old[s] × clip(L[signal][s], floor, 1.0)     # Bayesian update + floor
B_new      = (1 − α)·normalize(B_new) + α·uniform           # entropy decay
```
`floor = 0.1` prevents permanent state collapse; `α = 0.1` keeps the estimate responsive to mid-session state change. Both are tunable via the Leonardo sweep.
```
```

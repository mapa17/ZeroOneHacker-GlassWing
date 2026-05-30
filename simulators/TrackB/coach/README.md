# Glass Wing — Conversion Coach

> Insurance AI (UNIQA) · Zero One Hack_01

A behavioural **Conversion Coach** that infers what *state* a user is in
(orienting, evaluating, overwhelmed, ready, abandoning) from how they fill the
UNIQA insurance form, and routes each one — convert, retain, hand to a human,
or stay silent. Stat-blind Bayesian estimator + transparent decision policy.
No LLM, no network in the coach: deterministic, reproducible, auditable.

**Result:** 0/3 to 2/3 conversions across three segment personas, 0.00 annoyance.

---

## Quick start

```bash
pip install -r requirements.txt

python run_demo.py --persona all     # belief vector + coach actions per persona
python eval_harness.py               # OFF vs ON baseline -> 5 metrics -> extras/results/
python -m pytest tests/ -q           # 8 tests: estimator + contract enforcement
```

No API keys, no network, no GPU required.

Optional cluster sweep (Leonardo, off the critical path):
```bash
sbatch --array=0-24 run_sweep.sh
python aggregate_sweep.py
```

---

## Repository layout

```
README.md             this file
REPORT.md             jury-facing report (TL;DR, results, limitations)
ARCHITECTURE.md       module-level breakdown + pipeline diagram
METHODOLOGY.md        design-science methodology + honest limitations
LICENSE               MIT
requirements.txt

coach/                THE COACH (our lane)
  coach_engine.py       entry point - validates IN, guarantees OUT, never raises
  estimator.py          Bayesian belief over 5 states (STAT-BLIND)
  likelihood.py         signal event -> P(signal|state) vector
  policy.py             state+confidence+step+priors -> action + reason + tone

eval_harness.py       OFF vs ON comparison -> the 5 rubric metrics
run_demo.py           standalone demo spine (no web, no LLM, no network)
leo_sweep.py          parameter variance sweep (deterministic, CPU)
run_sweep.sh          SLURM array launcher for Leonardo
aggregate_sweep.py    collapse sweep outputs into a ranked table

fixtures/
  fake_signals.py       STUB for teammate #2's LLM personas

tests/                  estimator invariants + engine contract tests (8 tests)

docs/
  BRIEF.md              one-page team brief (the core thesis)
  interfaces.md         the two frozen contracts (signal in, action out)
  metaprompts.md        adversarial review council prompts

extras/
  hypotheses.md         the 3 drop-off logics (signal -> cause -> intervention)
  results/
    eval_summary.csv    eval output
```

## The thesis in one line

The same drop-off number hides three different failures. The coach infers
*which* one is happening - live, from behaviour alone - and routes accordingly.
The win is correct routing, not blanket conversion.

## The two walls (why results stay honest)

1. Estimator is stat-blind - state inferred from behaviour; identity emerges
   from the trajectory, never supplied.
2. Stats + emotional tone shape the response only - tagged [DESIGNED], never
   presented as a coach "discovery".

See METHODOLOGY.md for the full validity ceiling and limitations.

## Team

Glass Wing - coach lane (this repo) + LLM persona lane + web/journey lane.

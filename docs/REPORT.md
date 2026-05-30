# Glass Wing — Conversion Coach
### Insurance AI (UNIQA) · Zero One Hack_01

---

## TL;DR

We built a behavioural **Conversion Coach** that reads what *state* a user is in (orienting, evaluating, overwhelmed, ready, abandoning) from how they fill the UNIQA insurance form, and routes each one appropriately — convert, retain, hand to a human, or stay silent. It is a stat-blind Bayesian state estimator plus a transparent decision policy, not an LLM wrapper. In simulation across three segment personas it lifts conversion from **0/3 to 2/3 with a 0.00 annoyance rate**, and deliberately does *not* force the one persona whose segment was never an online-conversion play.

---

## Problem

UNIQA's online calculator loses ~94% of starters (5.6% conversion), with the heaviest drops at the initial price (66%) and final price (78%). The funnel data shows *where* people leave but not *why* — and treats everyone identically.

Our specific insight: **the single drop-off number hides three different failures.** The same screen breaks three segments for three unrelated reasons:
- **Judith (S1)** drops at initial price — a *channel contradiction* (the tariff she'd trust an advisor to sell her is online-locked).
- **Franz (S2)** drops at final price — a *trust breach* (the quoted price changed).
- **Peter (S3)** drops before price — a *complexity wall* (the form defeats him).

So we did **not** build "a coach that converts people." We built the layer that infers which failure is happening, live, and routes accordingly. The win is correct routing, not blanket conversion.

---

## Approach

- **Stat-blind Bayesian state estimator.** A belief vector over 5 states, updated multiplicatively per telemetry event (`B ∝ B × P(signal|state)`), with a likelihood floor (anti-collapse) and entropy decay (stays responsive to mid-session change). The estimator never reads segment stats — identity *emerges* from the trajectory.
- **Transparent decision policy.** Maps inferred state + confidence + journey step + trajectory-derived segment lean → an action tier (`silent → ambient → inline → prompted → active`) with a **mandatory human-readable reason** on every action. Silence is a first-class action.
- **Two frozen contracts** (`interfaces.md`) let three people build in parallel against stubs: a §1 signal-event in, a §2 action-object out.
- **Emotional weight, designed not detected.** A derived `support_tone` and a graceful-exit rule (overwhelmed + frustrated + low confidence → offer a human, stop pushing) encode segment emotional facts (e.g. NPS as a friction prior). The coach never claims to *sense* mood.
- **Deterministic by choice.** No LLM, no network in the coach — reproducible, auditable, and clear of the "LLM-wrapper" disqualifier. LLM lives only in the persona layer.

---

## How to run it

```bash
pip install -r requirements.txt
python run_demo.py --persona all     # belief vector + actions per persona
python eval_harness.py               # OFF vs ON, 5 metrics -> extras/results/
python -m pytest tests/ -q           # 8 tests: estimator + contract enforcement
```

No keys, no network, no GPU. Optional Leonardo sweep: `sbatch --array=0-24 run_sweep.sh`.

---

## Results

Baseline (coach OFF) vs coach ON, identical scripted journeys, three personas:

| Persona | Seg | Conv OFF→ON | State-recovery | Annoyance | Notes |
|---|---|---|---|---|---|
| Franz | S2 | 0 → **1** (+1) | 0.67 | 0.00 | caught at final price → `save_progress` (not advisor — segment rejects it) |
| Peter | S3 | 0 → **1** (+1) | 0.83 | 0.00 | early overwhelm → graceful exit to human |
| Judith | S1 | 0 → 0 (+0) | 0.38 | 0.00 | **deliberately not forced** — quiet disengage, segment isn't an online play |

**Headline: 0/3 → 2/3 conversions, 0.00 annoyance.** The Judith zero is a feature, not a miss: her segment converts online only 19% of the time regardless, and the coach correctly stays silent rather than annoying her — which is why annoyance is zero.

**Leonardo sweep finding (tuning, not validation):** sweeping decay/floor over a 25-point grid surfaced an *accuracy-vs-decisiveness tradeoff* — high decay raises per-call accuracy but makes the coach act far less often (decisive fraction drops from ~0.6 to ~0.35). The honest sweet spot balances the two, not the top "score" row.

---

## What worked

- **State inference from behaviour alone.** The belief vector visibly accumulates evidence and the segment lean falls out of the trajectory shape — Peter and Franz produce completely different signatures, recovered without any label.
- **Silence as a designed action.** 0.00 annoyance across all runs — the coach never fired on a not-at-risk user.
- **The graceful-exit rule.** Handing an overwhelmed, low-NPS user to a human instead of pushing reads as care, not conversion-squeezing.

## What didn't

- **Franz needed tuning.** His abandonment first slipped under the confidence gate (top state stuck on *evaluating*); fixed by sharpening cancel/back likelihoods + a final-price context boost. Honest: the hand-set matrix is "directionally right," not optimal.
- **Abandon-recall is low (0.0) for Judith/Peter** — their drop doesn't pass through the *abandoning* state (overwhelmed / quiet disengage instead), so the metric reads 0 though the state read is correct. A metric artefact, documented.

---

## What we'd do with another 36 hours

- **Cluster-variance sweep on Leonardo.** Sample N jittered persona instances per segment to create within-cluster variance, then test whether the coach routes the *atypical* Franz correctly — the real test of whether it learned the segment or memorised the archetype.
- **Real LLM personas** replacing the deterministic scripts, to reduce the encoding circularity between persona authoring and coach authoring.
- **A learned likelihood matrix** trained on the LLM-generated corpus, replacing the hand-set values.

---

## Honest limitations (full detail in `METHODOLOGY.md`)

- **Validity ceiling:** all findings describe the *customer model*, not real customers. No external behavioural claim.
- **Encoding circularity:** personas and coach are authored by the same team from the same theory; the WALL (estimator never sees labels) prevents one leak, but not this deeper one. Independent validation needs real users.
- **Variance:** state-variance is modelled; cluster-variance (within and between) is not.
- **Emotional weight is designed, not detected.**

---

## Credits & dependencies

- **Libraries:** numpy, pytest.
- **Models:** none (deterministic coach; LLM only in the persona layer, teammate-owned).
- **Compute:** Leonardo (EuroHPC) for the optional parameter sweep — CPU, off the critical path.
- **Data:** UNIQA segmentation (n=4,004), funnel analysis, live-calculator capture (2026-05-13).
- **AI coding assistant:** Claude (planning, scaffolding, methodology review).

## A note on honesty

The deterministic personas are scripted, and the demo runs on those scripts. The Leonardo sweep tunes constants — it does not validate against real users. The 2/3 result includes one deliberate non-conversion. All of this is stated because the honest frame — *we built and evaluated a customer model, and here is exactly what it can and cannot tell you* — is the defensible one.

---

*Companion docs: `BRIEF.md`, `METHODOLOGY.md`, `interfaces.md`, `extras/hypotheses.md`. Architecture: `ARCHITECTURE.md`.*

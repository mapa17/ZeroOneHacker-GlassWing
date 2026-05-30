# Methodology — Team Glass Wing

**Methodological spine:** Design science (build-and-evaluate an artifact — the Conversion Coach), with **hypothesis-testing as the embedded evaluation method**, not a separate paradigm.

**Validity ceiling (inherited by every claim and metric below):** all findings are about *the customer model* — a calibrated synthetic population — **not** about real UNIQA customers. No metric in this document should be read as an external behavioural fact. Where we say a hypothesis is "supported," we mean supported *within the simulation*.

---

## 2.7 Coding Categories and Analytical Approach

The analytical core is an a-priori **coding scheme of five mental states**, into which the coach classifies observed interaction.

**Categories:** *orienting, evaluating, overwhelmed, ready, abandoning.*

**Inclusion / exclusion rule:** categories are distinguished by **action-distinctness** — two candidate states that would trigger the same coach response are collapsed into one. A state earns its place only if it implies a different intervention. This keeps the scheme behaviourally grounded rather than psychologically speculative.

**Unit of analysis:** the interaction event (one telemetry signal), aggregated to the session.

**Analytical instrument:** the coach's Bayesian state estimator. Rather than assigning a hard label, it maintains a probability distribution across the five categories and updates it per event. Coding is therefore probabilistic and revisable, not one-shot.

**Note on category origin:** the scheme is theory-derived (from the UNIQA segmentation) and applied to simulated behaviour. It is not grounded-theory coding emerging from real transcripts — a limitation stated in §Limitations.

---

## 3.1 Research Approach

A **design-science approach**: we construct an artifact (the Conversion Coach — a state estimator plus decision policy) and evaluate it against a calibrated synthetic population of users. The embedded evaluation is **experimental** (coach OFF vs ON, plus per-hypothesis ablation).

We do **not** claim a field study. There is no live A/B access to real UNIQA users. The credibility of the design rests on two anchors:
1. **Calibration** of the baseline to the real funnel (66% / 24% / 78% conditional drops → ≈5.6% online conversion).
2. **Segment-grounded personas** instantiated from the real segmentation study.

The coach is the *intervention under study*; the simulation is the *test environment*; the comparison is the *evaluation*.

---

## 3.2 Research Setting

The **UNIQA online health-insurance calculator** (Privatarzt path, "myself only," Start/Optimal tariffs), reconstructed from live screenshots (capture 2026-05-13) as a nine-step journey.

**Boundary condition:** the coach operates only on the online-completable path. Hospital, "other persons," Opt. Plus/Premium, and the prior-private-insurance branch are out-of-scope routes — the coach cleanly routes these to an advisor and does not coach them. The setting is therefore the in-scope funnel, not the whole calculator.

---

## 3.3 Data Collection

Two layers. The credibility of the study depends on keeping the seam between them explicit.

**Source data (real):**
- UNIQA Retail Segmentation (n = 4,004) — sets persona priors.
- UNIQA funnel drop-off analysis (Dec 2025 – Feb 2026) — sets the calibration target.
- Captured form structure (screenshots, 2026-05-13) — defines the journey states.

**Generated data (synthetic):**
- LLM persona agents, each instantiated from a segment cluster, run through the journey and **emitting the telemetry stream** (dwell, back-navigation, hover target, progression velocity, tab-blur, optional chat text). This stream is the collected dataset analysed in §3.4.
- **Collection instrument:** the signal contract (`interfaces.md §1`).

**Non-circularity safeguard (collection level):** the persona agent never emits its own segment or state label. The coach collects behaviour only. (A deeper, residual circularity is addressed honestly in §Limitations.)

**Reproducibility control for the stochastic layer:** LLM personas are non-deterministic. We control this by fixing seeds and temperature, and by logging every prompt and emitted event so runs are inspectable and re-runnable. Residual non-determinism is acknowledged rather than hidden.

---

## 3.4 Data Analysis Procedures

The coach layer is the analytical engine; the experimental contrast is the analysis.

**1 · State estimation (the coding step).**
A Bayesian belief vector `B = [P(orienting), P(evaluating), P(overwhelmed), P(ready), P(abandoning)]` is updated per event:
```
B_new[s] ∝ B_old[s] × L[signal][s]   →   renormalise so Σ B = 1
```
Guards: likelihood floor (≥ 0.1, prevents permanent state collapse) and decay toward uniform (`B = 0.9·B + 0.1·uniform`, keeps the estimate responsive to mid-session state change). Segment identity is **derived from the belief trajectory**, never supplied.

**2 · Decision policy.**
Maps inferred state + confidence (peakedness of `B`) + journey step + segment prior → an action tier (`silent` → `ambient` → `inline` → `prompted` → `active`), with a **mandatory `reason` trace** as the audit trail.

**3 · Experimental comparison.**
Each persona run with the coach OFF (baseline) and ON, on identical seeds. The contrast isolates the coach's effect.

**4 · Ablation (hypothesis evaluation).**
For each drop-off hypothesis, disable only its named intervention. If drop-off returns to baseline, the hypothesis is *supported within the simulation*; if it does not move, the hypothesis is *falsified*. This is what moves a hypothesis from PROPOSED → SUPPORTED.

**5 · Measures** (all inherit the validity ceiling — they describe the model, not customers):
- **State-recovery rate** (primary) — agreement between the coach's inferred state and the state injected into the persona. This measures internal consistency and whether the estimator recovers the injected signal; it is **not** external accuracy.
- **Online-conversion uplift per persona** — coach ON vs OFF.
- **Drop-off reduction per critical step** (initial price, add-ons, final price).
- **Inference precision / recall** before an abandonment event.
- **Annoyance rate** — interventions fired on users not at risk.

---

## Limitations

Stated plainly, because naming the ceiling is what makes the rest credible.

1. **Construct validity — the central limitation.** All states are coded from *simulated* behaviour. Findings describe the customer model, not customers. Every metric above inherits this.

2. **Encoding circularity (deeper than the label-leak fix).** The persona behaviour rules and the coach's likelihood matrix are authored by the same team from the same theory. Keeping the segment label out of the telemetry prevents one leak, but the coach can still detect a persona partly because both encode the same assumption (e.g. "cancel-hover ⇒ abandoning" appears in both). The ablation tests whether the *intervention* helps — it does **not** dissolve this encoding circularity. Independent validation requires real users.

3. **State-recovery is internal, not external.** The "ground truth" state exists only because we defined it. High recovery shows the estimator is self-consistent, not that the state taxonomy is real.

4. **Stochastic personas.** LLM agents are non-deterministic; seed/temperature control and full logging mitigate but do not eliminate run-to-run variation.

5. **Snapshot setting.** The journey reflects the calculator as captured on 2026-05-13; the live form may since differ.

6. **Variance: state-level modelled, cluster-level not.** The estimator maintains a distribution over *states* (the belief vector), so it models within-session state uncertainty. It does **not** model variance over *clusters* — neither *within-cluster* (how individual Franzes differ from each other; our personas are near-deterministic scripts, so no spread exists to model) nor *between-cluster* (how separable the three segments actually are in behaviour-space; not yet measured). The honest claim is therefore "infers state; segment lean emerges from the trajectory" — **not** "distinguishes personas," which would require a between-cluster separation result we have not produced. *Upgrade path (Leonardo-tier stretch):* sample N persona instances per segment with jittered transition matrices (creates within-cluster variance), run the sweep, cluster the resulting belief-trajectories, and measure whether they recover the three segments. This would test whether the coach learned the segment or merely memorised the archetype.

7. **Metric caveats (read before the eval CSV).** Two metrics look like failures but are artefacts of how state is defined:
   - **Low abandon-recall (0.0 for Judith and Peter).** Their drop-off does not pass through the *abandoning* state — Peter exits as *overwhelmed*, Judith as quiet disengagement that never spikes past the confidence gate. The recall metric only counts the *abandoning* label, so it reads 0 even though the coach correctly identified their (different) states. Recall is meaningful only for Franz, whose exit *is* an abandonment.
   - **Deflated state-recovery rate.** Recovery counts every event, including early low-confidence steps where the belief is still near-uniform and the coach is *correctly* uncertain. These early "misses" are honest non-commitments, not errors — so the headline recovery figure understates the estimator's accuracy once it has evidence.

8. **Emotional weight is designed, not detected.** The `support_tone` field and the graceful-exit rule are `[DESIGNED]` from segment data (notably NPS as an emotional-friction prior) — they *encode* known segment facts ("Peter arrives frustrated; warmth-plus-concrete, not brand-warmth"). The coach does **not** detect affect (anxiety, frustration) from telemetry; behavioural signals are weak proxies for emotion and no such claim is made. Sentiment analysis of chat text and affect as a belief dimension are explicitly out of scope. The emotional layer shapes *how the coach responds once a state is inferred*, never *what state it infers* — same wall as the segment priors.

**Why this section is a credibility multiplier, not a weakness:** a study that names its own ceiling is trusted further than one that overclaims. The honest frame — *we built and evaluated a customer model, and here is exactly what it can and cannot tell you* — is the defensible position.

---

*Sources: UNIQA Retail Segmentation (n=4,004), persona briefings (May 2026), UNIQA funnel analysis (Dec 2025–Feb 2026), live-calculator capture (2026-05-13). Companion docs: `BRIEF.md`, `extras/hypotheses.md`, `interfaces.md`.*

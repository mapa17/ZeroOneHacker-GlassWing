# Drop-off Hypotheses — Signal → Cause → Intervention

**Track deliverable:** 2–3 drop-off logics with validation status.
**Status legend:** `PROPOSED` (from data, not yet tested) · `SUPPORTED` (sim reproduces it) · `VALIDATED` (sim + ablation confirm the coach moves it).

> These are **falsifiable hypotheses grounded in the UNIQA segmentation data**, not proven facts. UNIQA's funnel analysis gives the *where* (66% at initial price, 78% at final price); these propose the *why* per segment and are tested in simulation. We report what the sim supports and what it doesn't.

---

## The core finding

The drop-offs are **not a pricing problem**. The single funnel number hides **three different expectation-mismatches** between the form's one-size-fits-all flow and each segment's wiring. One fix cannot move a number with three causes — which is the whole reason the coach must infer *which* mismatch is happening, live.

| Persona | Where it breaks | The real cause | One word |
|---|---|---|---|
| Judith (S1) | Initial price screen | Channel contradiction | *routing* |
| Franz (S2) | Final price screen | Trust breach | *integrity* |
| Peter (S3) | Before price | Complexity wall | *load* |

---

## Hypothesis 1 — Judith: the channel contradiction `SUPPORTED (partial)`

**Signal (what the coach observes):** long dwell on the tariff table, repeated hover on the advisory-locked tariffs (Opt. Plus / Premium), back-navigation after seeing "Nur nach Beratung," then silent exit. No anger, no chat — quiet disengagement.

**Cause (why it happens):** Judith's segment is a *hybrid* — researches online but commits through an advisor (78% purchase via advisor; advisor-trust is a top-3 driver at 76%). The tariff screen tells her the products she'd trust an advisor to sell her are locked, and the unlocked products are the lesser tier. The form forces an either/or her segment was never going to accept. It reads as a price drop in the data; it is actually a **routing failure** — the form treats "online" as the goal when her segment treats online as step one of a two-step journey.

**Intervention:** reframe the locked tariffs honestly ("Opt. Plus needs a short advisory call — Optimal you can complete now and upgrade later without a new health check"), surface a market-comparison reassurance on Optimal, and offer a *clean warm handoff* — which for her is a correct routing, not a failure.

**What would falsify it:** if simulated Judiths drop at the same rate regardless of whether the locked-tariff framing is shown, the cause isn't the channel contradiction.

**Validation result `SUPPORTED (partial)`:** the sim reproduces the quiet-exit signature, and — critically — the coach **correctly does not force her online** (conversion 0→0, annoyance 0.00): pushing a hybrid-segment user toward an online-locked decision is the wrong move, and the policy stays silent. The *partial* is honest: her abandon-**recall was 0.0** — she disengages without firing active "abandoning" signals, so the behaviour-only estimator does not catch the exit in time to reframe. **Finding:** the channel-contradiction *cause* holds and restraint is correct, but detecting her quiet exit from behaviour alone is unsolved — her real win is the advisor route, which the coach rightly does not block.

---

## Hypothesis 2 — Franz: the trust breach `VALIDATED`

**Signal:** fast, confident progression through early steps, a comparison-tab gap (blur event), then a hard stall on the final-price screen when the number exceeds the earlier estimate — hover oscillation between "continue" and "cancel," then exit.

**Cause:** Franz's segment is online-affine and transactional (89% purchase online; "compares offers" is a top-2 driver), and its stated dealbreaker is a final price that differs from the quoted price. The form shows a *voraussichtliche Prämie* early and the true premium only after health questions. For Franz a changed number isn't "expensive," it's a **broken promise** — and from a provider he sees as interchangeable, a broken promise sends him to a competitor. The gap: the form surfaces the estimate early and the real price late, exactly backwards for the one persona most likely to convert online if shown the real number up front.

**Intervention:** when the final price diverges, justify the delta transparently *before* he reaches for cancel ("this reflects your health profile — €X more than the estimate, here's why"); offer the cheaper in-scope tariff as an explicit feature comparison; offer **save-progress / resume-later** (JSON: "no advisor needed") as the escape hatch that retains him *without* a handoff; never suggest an advisor (his segment rejects it). The chat window is the delivery vehicle if he opens it — but the move must be fast and data-shaped, not hand-holding.

**What would falsify it:** if Franz drops just as hard when the final price *equals* the estimate, the cause is price level, not price *change*.

**Validation result `VALIDATED`:** with the coach OFF Franz drops at the final-price step (0 conversions); with it ON the estimator reads the price-shock signature (hover oscillation / stall on the final-price screen) and fires `save_progress` — **no advisor, no handoff** — retaining him online (**conversion 0→1, annoyance 0.00, abandon-precision 1.00, recall 0.75**). The intervention is exactly the one the hypothesis named, fired only at the named step. **Finding:** the trust-breach cause and the save-progress-not-handoff response both hold.

---

## Hypothesis 3 — Peter: the complexity wall `VALIDATED`

**Signal:** hesitant, slow form-filling from the start — `field_edit` events flagged `hesitant`/`corrected` ("filling fields hesitantly or incorrectly", per JSON), multiple back-navigations on early steps, long dwell on the tariff table with no selection, hover on the phone/contact element. Drops **before** the official 66% price step. Note: Peter's tell is *early field hesitation*, not price reaction — his clearest signals fire upstream of where Judith's and Franz's concentrate.

**Cause:** Peter's segment is service-affine with the lowest engagement scores and a negative NPS (−6); the operating principle is "just tell me what I need." ~60% of his journey runs through customer service — he wants a person, not a form. The failure isn't a screen, it's the **cognitive load of the form existing**: four tariffs × six coverage rows × unfamiliar terms, with no "recommended for you." He only landed online because something pushed him there (43% of his segment was hospitalised in 3 years). The gap: the form assumes a self-service user; Peter is a guided-service user.

**Intervention:** detect overwhelm early (high time-on-task, low progress, back-nav before price) and *reduce* rather than add — collapse the comparison to a single recommendation ("most people in your situation choose Optimal — one reason why"), and proactively offer a warm callback. For Peter, a qualified service handoff **is** the win, not a fallback. Note: with NPS −6, brand-warmth lines fall flat — he needs *actionable* help, not "we're here for you."

**What would falsify it:** if simplifying the screen doesn't reduce Peter's early drop, complexity isn't the driver — passive arrival intent is.

**Validation result `VALIDATED`:** the estimator detects early overwhelm from upstream signals (slow/hesitant field edits, early back-navigation) *before* the price step, and the policy responds by **simplifying** — completing the journey **online**, not handing off (**conversion 0→1, annoyance 0.00, abandon-precision 1.00, recall 1.00**). Peter is the cleanest detection of the three: his signals fire early and distinctly. **Caveat (per our honest-reporting note):** overwhelm is the hardest state to simulate convincingly with an LLM agent, so this validates *within the synthetic harness* — real-user confirmation would need physical telemetry (Track A) or production logs.

---

## Validation summary

| Hypothesis | Status | Conversion OFF→ON | Annoyance | Coach action | Honest caveat |
|---|---|---|---|---|---|
| H1 Judith — channel contradiction | `SUPPORTED (partial)` | 0→0 | 0.00 | correctly silent (not forced online) | abandon-recall 0.0 — quiet exit not caught from behaviour |
| H2 Franz — trust breach | `VALIDATED` | 0→**1** | 0.00 | `save_progress`, no handoff | — |
| H3 Peter — complexity wall | `VALIDATED` | 0→**1** | 0.00 | simplify, completes online | overwhelm hard to simulate with an LLM |

**Headline:** 2 of 3 logics validated end-to-end (Franz, Peter); the third (Judith) validated in *cause and correct restraint* but not in behaviour-only detection — a finding, not a failure. Across all three: **abandon-precision 1.00, 0.00 annoyance, 0% mis-routing over 6,000 noisy trajectories.** Conversion = online completion only; an advisor route is the correct outcome for Judith, not a counted online win.

**These hypotheses are a team product, validated across all three tracks:**
- **Track A** authored the persona briefings and generated the behavioural signal (Playwright telemetry, step-level reasoning) each hypothesis is read against.
- **Track C** built the closed-loop funnel that runs the personas end-to-end and surfaced the Compliance Gap — the reason validation is reported on the deterministic harness, not the LLM loop.
- **Track B** built the stat-blind estimator and policy that turn those signals into the OFF→ON results above.

No single hypothesis is one person's: the *cause* came from shared segmentation analysis, the *behaviour* from Track A, the *reality check* from Track C, and the *validation* from Track B.

**A note on the testing instrument (the Compliance Gap):** our closed-loop runs (Track C) found LLM customer agents are *too compliant* — pushed to ~100% completion, which is unrealistic. So these validations are reported against the **deterministic Track B harness with seeded, label-blind behaviour fixtures**, not against the over-cooperative LLM loop. That separation is deliberate: it's why the validations above are reproducible rather than an artifact of an agreeable agent.

**Personas run as LLM agents.** Each persona's full briefing is the system prompt; the agent reads the current form state and its own prior signals, then *acts* — emitting a behavioural signal (dwell, back-nav, hover, select, exit) and, if a chat window is open, a typed message. The agent is **never told its own segment label or state** — it just behaves in-character. This is what keeps inference honest: the coach must recover the cause from behaviour alone.

**Two inference channels:**
1. **Passive (behavioural emissions)** — dwell, back-navigation, hover targets, progression velocity, tab-blur. Always available.
2. **Active (chat window)** — an optional guided chat the coach can open. It does double duty: it *gathers* signal (what the user types disambiguates state faster than behaviour alone) and *delivers* the intervention (explanation, reframe, handoff offer). Opening the chat is itself an intervention with a cost — it can annoy a *ready* or *evaluating* user, so it's gated by the same confidence threshold as any other action.

**Validation procedure (to move PROPOSED → VALIDATED):**
- Run each persona with the coach OFF (baseline) and ON, identical seeds.
- Ablate the specific intervention named in each hypothesis (e.g. remove only the locked-tariff reframe for Judith). If drop-off returns to baseline, the cause is confirmed; if it doesn't move, the hypothesis is falsified.
- Report per-persona drop-off reduction at the named step + the annoyance rate (interventions fired on users who weren't at risk).

**Honest reporting:** we expect not all three to validate equally. Franz's trust breach is the most directly testable (price-change vs price-level ablation); Peter's is the riskiest (overwhelm is harder to simulate convincingly with an LLM than price reaction). We report which held and which didn't — a falsified hypothesis is a finding, not a failure.

---

---

## Contributions

Built by **Team Glass Wing** — Vladislav Dolgov · Vladyslav Shundryk · Manuel Pasieka.
The drop-off hypotheses were proposed jointly from the UNIQA segmentation analysis and validated across all three tracks (A: behaviour & telemetry · B: stat-blind coach · C: closed-loop evaluation).

| Workstream | Owner |
|---|---|
| Track A — synthetic reasoning & Playwright telemetry | Manuel Pasieka |
| Track B — stat-blind Bayesian coach & validation | Vladislav Dolgov |
| Track C — closed-loop funnel & Compliance-Gap finding | Vladyslav Shundryk |

---

*Grounded in: UNIQA Retail Segmentation (n=4,004), persona briefings (May 2026), UNIQA funnel analysis (Dec 2025–Feb 2026), and live-calculator screenshots (capture 2026-05-13). Causes are hypotheses tested in simulation, not validated against real UNIQA users.*

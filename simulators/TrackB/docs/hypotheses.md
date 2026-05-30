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

## Hypothesis 1 — Judith: the channel contradiction `PROPOSED`

**Signal (what the coach observes):** long dwell on the tariff table, repeated hover on the advisory-locked tariffs (Opt. Plus / Premium), back-navigation after seeing "Nur nach Beratung," then silent exit. No anger, no chat — quiet disengagement.

**Cause (why it happens):** Judith's segment is a *hybrid* — researches online but commits through an advisor (78% purchase via advisor; advisor-trust is a top-3 driver at 76%). The tariff screen tells her the products she'd trust an advisor to sell her are locked, and the unlocked products are the lesser tier. The form forces an either/or her segment was never going to accept. It reads as a price drop in the data; it is actually a **routing failure** — the form treats "online" as the goal when her segment treats online as step one of a two-step journey.

**Intervention:** reframe the locked tariffs honestly ("Opt. Plus needs a short advisory call — Optimal you can complete now and upgrade later without a new health check"), surface a market-comparison reassurance on Optimal, and offer a *clean warm handoff* — which for her is a correct routing, not a failure.

**What would falsify it:** if simulated Judiths drop at the same rate regardless of whether the locked-tariff framing is shown, the cause isn't the channel contradiction.

---

## Hypothesis 2 — Franz: the trust breach `PROPOSED`

**Signal:** fast, confident progression through early steps, a comparison-tab gap (blur event), then a hard stall on the final-price screen when the number exceeds the earlier estimate — hover oscillation between "continue" and "cancel," then exit.

**Cause:** Franz's segment is online-affine and transactional (89% purchase online; "compares offers" is a top-2 driver), and its stated dealbreaker is a final price that differs from the quoted price. The form shows a *voraussichtliche Prämie* early and the true premium only after health questions. For Franz a changed number isn't "expensive," it's a **broken promise** — and from a provider he sees as interchangeable, a broken promise sends him to a competitor. The gap: the form surfaces the estimate early and the real price late, exactly backwards for the one persona most likely to convert online if shown the real number up front.

**Intervention:** when the final price diverges, justify the delta transparently *before* he reaches for cancel ("this reflects your health profile — €X more than the estimate, here's why"); offer the cheaper in-scope tariff as an explicit feature comparison; offer **save-progress / resume-later** (JSON: "no advisor needed") as the escape hatch that retains him *without* a handoff; never suggest an advisor (his segment rejects it). The chat window is the delivery vehicle if he opens it — but the move must be fast and data-shaped, not hand-holding.

**What would falsify it:** if Franz drops just as hard when the final price *equals* the estimate, the cause is price level, not price *change*.

---

## Hypothesis 3 — Peter: the complexity wall `PROPOSED`

**Signal:** hesitant, slow form-filling from the start — `field_edit` events flagged `hesitant`/`corrected` ("filling fields hesitantly or incorrectly", per JSON), multiple back-navigations on early steps, long dwell on the tariff table with no selection, hover on the phone/contact element. Drops **before** the official 66% price step. Note: Peter's tell is *early field hesitation*, not price reaction — his clearest signals fire upstream of where Judith's and Franz's concentrate.

**Cause:** Peter's segment is service-affine with the lowest engagement scores and a negative NPS (−6); the operating principle is "just tell me what I need." ~60% of his journey runs through customer service — he wants a person, not a form. The failure isn't a screen, it's the **cognitive load of the form existing**: four tariffs × six coverage rows × unfamiliar terms, with no "recommended for you." He only landed online because something pushed him there (43% of his segment was hospitalised in 3 years). The gap: the form assumes a self-service user; Peter is a guided-service user.

**Intervention:** detect overwhelm early (high time-on-task, low progress, back-nav before price) and *reduce* rather than add — collapse the comparison to a single recommendation ("most people in your situation choose Optimal — one reason why"), and proactively offer a warm callback. For Peter, a qualified service handoff **is** the win, not a fallback. Note: with NPS −6, brand-warmth lines fall flat — he needs *actionable* help, not "we're here for you."

**What would falsify it:** if simplifying the screen doesn't reduce Peter's early drop, complexity isn't the driver — passive arrival intent is.

---

## How these are tested (not just asserted)

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

*Grounded in: UNIQA Retail Segmentation (n=4,004), persona briefings (May 2026), UNIQA funnel analysis (Dec 2025–Feb 2026), and live-calculator screenshots (capture 2026-05-13). Causes are hypotheses tested in simulation, not validated against real UNIQA users.*

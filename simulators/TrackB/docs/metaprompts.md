# Metaprompt Council — Coach Build (Team Glass Wing)

Five reusable prompts. Paste any single one into a fresh model with your docs (`BRIEF.md`, `hypotheses.md`, `interfaces.md`, `METHODOLOGY.md`, the estimator/policy code) attached. Or run the **Master** to chain all four in sequence.

Two prompt families:
- **DISTILL** — compress to a defensible core (build).
- **BREAK** — attack the core to find where it fails (survive Q&A).

Run distill *then* break: build the claim, then try to destroy it.

---

## 1 · DISTILL — The Core Claim

```
You are a sharp technical reviewer helping a hackathon team sharpen their pitch.
Attached: our project docs for an insurance "Conversion Coach".

Do NOT praise. Distill only.

1. State our core claim in ONE sentence a skeptical judge would accept.
2. Name the single technical artifact that earns that claim. If it's a prompt
   wrapper, say so bluntly.
3. List the 3 load-bearing assumptions the claim rests on. For each, mark:
   [DATA-BACKED] / [DESIGNED] / [HOPED].
4. Identify the ONE thing that, if removed, collapses the whole project.
5. Rewrite our claim with every word we cannot defend deleted.

Be terse. No encouragement. If the core is thin, say it is thin.
```

---

## 2 · BREAK — The Circularity Attack

```
You are a hostile thesis examiner. Your goal is to prove our coach's results
are self-fulfilling.

Context: our personas (LLM agents) and our coach's likelihood matrix were
written by the same team from the same segmentation theory. We keep the
segment label out of the telemetry stream.

Attack:
1. Show me the path by which the coach "detects" a persona ONLY because both
   encode the same assumption. Use a concrete signal (e.g. cancel-hover).
2. Explain why our ablation test does NOT break this circularity.
3. State what our "state-recovery rate" actually measures, in the most
   deflating accurate terms.
4. Give the exact question you'd ask on stage to expose this. Then give the
   ONLY honest answer that survives it.
5. Rate our circularity defense 1–5 and say what would make it a 5.

Assume we will overclaim. Catch us.
```

---

## 3 · BREAK — The "It Just Annoys People" Attack

```
You are a UX-skeptical product lead who has seen 100 exit-intent popups fail.
You believe our coach is a fancy popup that interrupts people who were fine.

Attack:
1. Construct the worst case: a high-intent user (Franz, ready to buy) our coach
   wrongly interrupts. Walk the exact signal sequence that misfires.
2. Show where our Annoyance Rate metric could be gamed or could hide this.
3. Challenge our dwell-time logic: why won't a careful slow reader trip
   "overwhelmed"? Make us prove the ratio-to-baseline defense actually holds.
4. Name one intervention tier we should probably DELETE because it does more
   harm than good.
5. If silence is the right move 80% of the time, why build a coach at all?
   Force a real answer.

Do not accept "we gated it by confidence" without making us show the threshold.
```

---

## 4 · DISTILL — The Scope Discipline Check

```
You are a hackathon mentor with 4 hours left on the clock. Your only job is to
stop us building the wrong thing.

Given our docs and current TODO:
1. List everything we are building that the JURY RUBRIC does not reward. Cut it.
2. Identify the one deliverable that is currently nobody's clear job. (Look hard
   at the eval / measurement.)
3. Our demo must run standalone if teammates' parts slip. Confirm our coach
   module has zero hard dependencies on the live web layer — or name the
   dependency that will sink us at hour 30.
4. Rank our remaining tasks by (jury value ÷ hours). Tell us what to drop.
5. State the single sentence we must be able to say at the demo. If our build
   doesn't yet support saying it, say what's missing.

Be ruthless about scope. Polish is the enemy.
```

---

## 5 · MASTER — The Council Orchestrator

```
You are running a 4-member adversarial review council on our hackathon project
(insurance "Conversion Coach"). Docs attached.

Run each member IN SEQUENCE. Do not merge them. Label each section clearly.
After each, pause and carry forward only the findings that survived.

MEMBER 1 — DISTILLER: State our defensible core claim in one sentence. Mark our
3 key assumptions [DATA-BACKED]/[DESIGNED]/[HOPED]. Name what collapses the
project if removed.

MEMBER 2 — CIRCULARITY EXAMINER: Prove our results could be self-fulfilling
(same team authored personas + coach). State what state-recovery rate really
measures. Give the killer stage question + the only honest answer.

MEMBER 3 — UX SKEPTIC: Construct the worst false-positive interruption. Attack
the dwell logic. Name one tier to delete. Answer "why build a coach if silence
wins 80% of the time."

MEMBER 4 — SCOPE MENTOR (4h left): Cut everything the rubric doesn't reward.
Find the unowned deliverable. Confirm the demo runs standalone. Rank tasks by
value÷hours. State the one sentence we must say at demo.

THEN — COUNCIL VERDICT:
- The 3 things we MUST fix before building further.
- The 1 claim we MUST stop making (overclaim risk).
- The 1 thing we should build next, and why.
- Our honest survival odds in Q&A (1–5) and the single highest-leverage change.

Rules: no praise, no hedging, terse. If something is thin, say thin. Catch our
overclaims before the jury does. Hold the validity ceiling everywhere: findings
are about the customer MODEL, not customers.
```

---

## My coach-building rules (the constraints the council must respect)

These are the non-negotiables any prompt above should hold us to:

1. **Inference over oracle** — the coach never sees the persona's true label; identity emerges from the belief trajectory.
2. **Silence is a first-class action** — over-firing is the failure mode, measured by Annoyance Rate.
3. **Auditable, not learned** — hand-set likelihood matrix, "directionally right," every cell explainable. No trained black box.
4. **Validity ceiling held everywhere** — findings describe the customer model, not customers.
5. **Demo runs standalone** — coach module has zero hard dependency on the live web layer (fake emitter is the spine).
6. **Reason trace mandatory** — every action carries a human-readable why; that is our "visible reasoning."
7. **Scope is sacred** — if a task doesn't serve "read the state, then route," question it.

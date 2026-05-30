# BRIEF — UNIQA Conversion Coach

**Track:** Insurance AI (UNIQA) · Zero One Hack_01
**Status:** angle locked, build not started

---

## The brief (read this first)

> We're not building a coach that pushes people to convert — we're building the **detection layer** that reads what *state* a person is in (researching, browsing, overwhelmed, ready) from how they fill the form, so UNIQA can **route** each one correctly. The win isn't conversion uplift; it's reading the state honestly, because you can't route — to purchase, to advisor, or to a clean exit — until you know what's really happening.

**One line:** The same drop-off is three different states wearing one number. Tell them apart live, then route — don't nudge everyone toward "buy."

---

## What we believe (and what we're testing)

UNIQA's premise is "abandoners were interested, they just needed a nudge." We don't swallow that. Some abandoners are **researching**, some are **browsing**, some are **overwhelmed**, some are genuinely **ready**. A nudge only helps the ready/recoverable ones. **The honest result — lift the recoverable states, cleanly release the ones who were never going to convert online — beats a fake "we converted everyone."**

---

## Core principles (do not violate)

- **States, not personas.** Judith / Franz / Peter are the *test instrument*. What the coach infers is the **state**. Keep this distinction sharp — it's the whole wedge.
- **Inference over oracle.** The coach is never told who it's talking to. It guesses state from signals and can be wrong. That risk is what keeps the proof **non-circular** — don't engineer it away.
- **Success = correct routing**, not conversion alone. Online completion, warm handoff, and clean exit each count *when they match the true state*.

---

## Touchpoints — where state is readable

Mapped to the real form (from live screenshots, capture 2026-05-13):

| Step | Signal of state |
|---|---|
| **DOB + SV number** | Hesitation = overwhelm or trust wall (pre-price) |
| **Initial price / tariff table** *(66% drop)* | Dwell, tariff toggling, hover on advisory-locked tariffs, tab-switch → separates *researching* / *price-shocked* / *comparing* |
| **Add-ons** *(24% drop — in-scope, screenshot-confirmed)* | Toggling + abandonment = "got complicated again" |
| **Prior-insurance question** *(hidden trigger)* | Answering *ja* ends the online path — hard route-out, not a state read |
| **Final price** *(78% drop)* | Small unexplained jump reads very differently for *ready* (leaves) vs *researching* (expected it) |

---

## Scope (hard boundaries)

**In:** Privatarzt · "Myself only" · Start (€42.84) / Optimal (€75.91) online tariffs.
**Out (clean route to advisor, no coaching):** Hospital · "Other persons" · Opt. Plus / Premium · *prior-private-insurance = ja*.
**Always:** support comprehension/navigation; **never** remove or skip a form field.

---

## How we'll prove it works

Same personas, same seeds, run **with vs without** the coach. Baseline must reconcile the real funnel (66 / 24 / 78 → ≈5.6% online). Report: routing accuracy + conversion uplift **per state**, plus the annoyance rate (interventions fired when the user wasn't actually at risk). The credibility line: personas are frozen *before* coach design, and the coach only ever sees signals — never the true state.

---

## Leonardo — how we actually use it

**Intent: yes, we're using Leonardo.** Confirmed from the AI:AT hackathon deck — this is the real Leonardo (Top500 #10, A100-64GB).

**Access is easy this weekend (onboarding risk is GONE):** plain password SSH, **no 2FA, no certificate dance** — `ssh <user>@login01-ext.leonardo.cineca.it`. Day-zero recon shrinks to: log in → `sinfo` / `squeue --me` → submit one tiny test job against the reservation → confirm it lands. ~15 minutes.

**Hard constraints that shape the build (don't discover these late):**

- **Compute nodes have NO internet.** Only a flaky low-bandwidth proxy that drops every ~10 min. → **No hosted-API calls from inside a job.** LLM personas on Leonardo = run a *local* model in a **Singularity** container (deck ships a `vllm-openai` example), not an OpenAI/Anthropic call. Deterministic personas need no internet at all.
- **One node per team** (reservation = 1 node). Scale story is "1 node × 4 A100s / 32 CPU cores," not "flood the cluster." Plenty for deterministic Monte-Carlo; finite for LLM inference.
- **Storage:** write outputs to `$SCRATCH` (`$HOME` = 50 GB; `$FAST`/`$WORK` off-limits this weekend; `$SCRATCH` wiped after 40 days — pull results to laptop).
- **Env:** they use **`pixi`** (not conda) + **Singularity** (not Docker). We still owe the jury a `requirements.txt` for clean-checkout → maintain pixi for Leonardo *and* a pip manifest for submission.
- **Reservation flag:** `#SBATCH --reservation=s_tra_ncc`. Test with short jobs (`--time=0:30:00`) before any long run.
- **Secret hygiene:** the proxy credential is in the deck — fine to use, but read it from an env var; **never commit it** to the public MIT repo.

**The fork this sharpens — which persona engine:**

| If personas are… | Where | Internet needed? | Reproducible? |
|---|---|---|---|
| **Deterministic** (rule/Markov agents) | CPU cores; `lrd_all_serial` is **budget-free** | **No** — runs anywhere | Yes — seeds |
| **LLM-driven** (local model, Singularity) | **Booster** A100s | No (model is local) but needs container build | Looser — fix seed/temp, log prompts |

The no-internet rule tilts decision #2 toward **deterministic** as the low-friction path; LLM personas are now a deliberate, costed choice (local model + container), not a free upgrade.

**Default posture:** build + prove on a laptop; architect the runner to **fan out across the 32 cores / SLURM array jobs**; treat the cluster as the **scale/deployment story** (plus a real sweep, now that access is cheap).

---

## Open decisions (in order — each unlocks the next)

1. **Headline wedge** — leaning *inference/detection* (read state), with discovery + handoff as support.
2. **LLM vs deterministic personas** — **decide first.** Picks GPU-vs-CPU, the Leonardo partition, and reproducibility posture all at once.
3. **Leonardo** — access is confirmed cheap (password SSH, no 2FA), so it's *both* weekend compute **and** the scale narrative. The only real lever is persona engine (decision #2): no-internet on compute nodes makes deterministic the low-friction path.

---

*Refer back to this when scope drifts. If a build task doesn't serve "read the state, then route," question it.*

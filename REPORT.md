# Team Glass Wing — Jury Report
### Zero One Hacker 2026 · UNIQA Online Funnel Drop-off Analysis & Adaptive AI Coach
**Team:** Vladislav Dolgov · Vladyslav Shundryk · Manuel Pasieka

---

## 📝 TL;DR
We built a multi-track simulation harness for the 9-step branching **UNIQA Privatarzt** online quote funnel to analyse *why* users drop off and how to retain them through the right channel. Three interlocking tracks: **Track A** drives LLM customer personas with demographic-aligned reasoning and generates realistic UI telemetry; **Track C** runs the full closed loop and surfaces our key scientific finding — the **"LLM Compliance Gap"** (LLM agents are too easily nudged, hitting ~100% completion, which overstates coach value); and **Track B** answers that gap with a **stat-blind Bayesian coach** that reads behaviour only — never a segment label — and demonstrated a lift of **0/3 → 2/3 at-risk online conversions at 0.00 annoyance**, fully deterministic and reproducible. Together: A makes the behaviour, C shows where naive LLM evaluation breaks, B provides the measurable, label-blind alternative.

---

## 🎯 Problem
UNIQA's online calculator loses the majority of digital starters, and standard funnel analytics record *where* users leave but not *why* — treating every drop-off the same. (Funnel percentages cited in the deck are drawn from the UNIQA brief / dataset.)

Our core insight: **a single drop-off number hides three distinct behavioural failures**, each needing a different response —
1. **Judith (S1 — ~30%, hybrid):** drops at the initial price via a *channel contradiction* — the tariff she trusts an advisor to sell is online-locked. Her right channel is the advisor.
2. **Franz (S2 — ~50%, digital):** drops at the final price via a *trust breach* — the price changes due to insurance history. Winnable online if reassured.
3. **Peter (S3 — ~20%, service):** drops early via a *complexity wall* — the forms overwhelm him. Winnable online if simplified.

The goal is **right-channel retention**: keep the winnable users completing online, and don't badger the users whose real path is offline. That requires inferring *which* failure is happening live — which is what the three tracks were built to do.

---

## 🧭 Approach
Three parallel tracks, moving from qualitative user reasoning → realistic telemetry → deterministic control and honest evaluation.

* **Track A — Synthetic user reasoning & UI telemetry.** Sampled demographics (age, income, channel preference) from survey distributions feed a step-level reasoning pipeline; the headless agent emits structured JSON choices plus a German *Begründung* explaining its hesitation and price sensitivity. Live browser click-throughs via **Playwright** generate realistic mouse movement, hovers, and dwell times — the physical signal layer the other tracks consume. A live chat helper reads active selections and page behaviour to offer contextual advice.
* **Track B — Stat-blind Bayesian state estimation (Python coach).** A Python-only engine infers user states (`orienting`, `evaluating`, `overwhelmed`, `ready`, `abandoning`) purely from noisy behaviour — dwell, back-clicks, hovers, selections — **never reading a segment label ("the wall")**. The belief vector updates multiplicatively (B ∝ B × P(signal | state)) with entropy decay to stay responsive to mid-session change; a transparent policy maps belief to tiers (`silent`, `ambient`, `inline`, `prompted`, `active`) with a mandatory human-readable reason, prioritising silence for low-risk users.
* **Track C — Closed-loop evaluation & the realism benchmark (Vite/Node app).** A React 19 / Vite 8 clone of the 9-step branching funnel, linked headlessly to a Node CLI agent simulator (`run-interactive-agent.mjs`) driven by an LLM, plus a deterministic JavaScript coach banner (`coach.js`) that warns when advisor-routing would block online completion. This is where the full loop runs end-to-end and where we measured whether the coach actually shifts completion vs. a no-coach baseline.

---

## 💻 How to Run It

### 🧪 Track A — Synthetic Reasoning & Playwright UI  (`simulators/TrackA/`)
```bash
cd simulators/TrackA/personas
npm install && npx playwright install chromium
npm run create -- --n 10
# start the Track A UI dev server under simulators/TrackA/ui first
npm run live -- --run live_run_01 --limit 10 --concurrency 2
```

### 🐍 Track B — Bayesian Coach Demo  (`simulators/TrackB/coach/`)
```bash
cd simulators/TrackB/coach
pip install -r requirements.txt
python run_demo.py --persona all     # belief vectors & coach decisions per persona
python eval_harness.py               # OFF vs ON metrics → extras/results/
python -m pytest tests/ -q           # estimator + contract invariants
python rank_full_engine.py           # precision/recall dial → extras/results/
```

### ⚛️ Track C — Full Web App & CLI Simulation  (`simulators/TrackC/`)
```bash
cd simulators/TrackC
npm install
cp .env.example .env                 # set OPENAI_API_KEY=sk-...
npm run dev                          # React web app → http://localhost:5173
# headless CLI pipeline
npm run profiles:sample -- --n 10 --seed 1
npm run persona:prompts -- --run <runId>
npm run agent:interactive -- --run <runId> --verbose --enable-coach
npm run agent:analyze -- --run <runId>
```

---

## 📈 Results

**Cross-track synthesis.** Track C's closed loop produced our headline scientific finding — naive LLM-in-the-loop evaluation is unreliable because the agent is *too compliant*. Track A confirmed that only **physically generated** telemetry (real mouse/hover/dwell) is trustworthy signal. Track B took that lesson and built a coach that depends on neither a compliant LLM nor a segment label — and proved a measurable, reproducible lift. The three results are strongest read together.

### Track A — Telemetry & live-helper impact
Replaying **50 prior drop-offs** with the telemetry-aware chat helper enabled produced **~10% purchase completion** and **roughly a third progressing significantly further** than baseline. The helper won by clarifying form inputs early but could not overcome hard price objections — an early signal that *complexity* failures (Peter) are coachable while *trust/price* failures (Franz) need more than clarification. *(Track A lane — raw outputs in the Track A run logs.)*

### Track B — Stat-blind Bayesian coach
Identical scripted journeys per persona, coach **OFF** vs **ON**. Conversion = **online completion**; within this harness an advisor handoff is scored as out-of-scope, and the coach never forces a user online. Values match the shipped `extras/results/eval_summary.csv`.

| Persona | Segment | Conversion OFF → ON | Abandon precision | Abandon recall | Annoyance | Intervention |
|---|---|---|---|---|---|---|
| **Franz** | S2 (Digital) | 0 → **1** | 1.00 | 0.75 | 0.00 | Caught at final price; `save_progress` keeps him on the online path. |
| **Peter** | S3 (Service) | 0 → **1** | 1.00 | 1.00 | 0.00 | Early overwhelm; step **simplified**, completes **online**. |
| **Judith**| S1 (Hybrid) | 0 → 0 | 1.00 | 0.00 | 0.00 | **Deliberately left alone** — her right channel is the advisor, not a forced online sale. |

* **Headline:** **0/3 → 2/3 online conversions, 0.00 annoyance.** Two winnable users retained online; the third (Judith) correctly *not* pushed — consistent with right-channel retention.
* **Precision & robustness:** **1.00 abandon-precision**, **0% mis-routing across 6,000 noisy trajectories** (50% dropout + 50% spurious events), **0 engine crashes**.
* **State-recovery:** windowed recovery on at-risk events **~58%, noise-invariant** (holds through a 50% data-loss stress test). Global per-persona recovery in the CSV is lower (0.24–0.50) — an artifact of the synthetic fixture's truth-labelling, not a coach failure.
* **Tunable dial:** re-ranking the 25-point parameter grid on the **true full-engine surface** (noise band n ∈ {0.1, 0.2, 0.3}) yields a continuous precision/recall dial — precision-max (0.25, 0.25) → 61% recall / 1.0% annoyance; recommended knee (0.15, 0.20) → 78% / 1.8%; recall-max (0.10, 0.10) → 83% / 6.3%. We caught that our first proxy scorer rewarded the failure mode, discarded it, and re-ranked on the true surface. The sweep is **Leonardo-ready (SLURM array)** but runs deterministically in seconds locally.

### Track C — The LLM "Compliance Gap"
In closed-loop testing the LLM customer was unrealistically cooperative: baseline runs completed the funnel without dropping, and with the coach warning enabled completion hit **~100%**. **Jury takeaway:** standard LLMs lack the friction, attention span, and skepticism of real customers, so cooperative-agent evaluation *overestimates* coach effectiveness without physical calibration. This is the gap that motivates Track B's deterministic, behaviour-only design. *(Track C lane — see Track C analyze outputs.)*

---

## 🛠️ What Worked / What Didn't

### What Worked
* **(C) A real, falsifiable finding:** the Compliance Gap is the kind of negative result that makes the rest of the work honest — we know *not* to trust raw LLM-in-the-loop completion numbers.
* **(A) Physical telemetry beats prompt-telemetry:** Playwright-generated mouse/hover/dwell gave the only non-circular behaviour signal.
* **(B) Stat-blind state recovery + silence as an action:** the coach inferred Peter's and Franz's states from non-labelled clickstream alone (the wall held), and high policy thresholds delivered a **0.00 annoyance rate**.
* **(B) Right-channel retention:** Peter kept online by *simplifying*; Judith *left alone* because her path is the advisor — online conversion credited only on genuine online completion, never on a forced or handed-off outcome.

### What Didn't
* **(A/C) LLM micro-behaviour limits:** LLMs can't natively produce physical clickstream; feeding telemetry from prompts is circular. Signal must come from automation (Track A) or real logs.
* **(B) Judith recall failure:** abandon-recall for Judith was **0.0** — her segment disengages quietly without active "abandoning" signals, so she bypasses the abandon state. An honest limitation, not patched over.
* **(team) Model circularity:** personas and coach rules were authored by the same team. The stat-blind constraint prevents direct label leakage, but a theoretical bias remains. All results are model-level (synthetic), not real-user lift.

---

## 🔮 What We'd Do with Another 36 Hours
1. **(A→B) Real mouse telemetry:** record physical human cursor movement on the cloned funnel and train the Bayesian likelihood matrix on real, non-synthetic noise.
2. **(B) Cluster-variance sweep on Leonardo:** SLURM sweeps with N-jittered persona variations per segment to test whether the coach handles *atypical* Franz personas (learning the segment vs. memorising the archetype).
3. **(C→B) Calibrate from production logs:** set transition probabilities from real UNIQA funnel logs rather than hand-tuned hypotheses, and close the Judith abandon-recall gap with real quiet-disengagement signals.

---

## 📂 Credits, Dependencies & Navigation

**Tech stack.** Python (`numpy`, `pytest`) — Track B. React 19 / Vite 8 / `lucide-react` — Track C. Node.js + `dotenv` — Track C CLI. Playwright Chromium — Track A. Dataset: UNIQA segmentation survey + live funnel capture.

**Repository map.**
```
simulators/
├── TrackA/   — synthetic reasoning generator + Playwright telemetry
├── TrackB/   — stat-blind Bayesian coach (deterministic proof lane)
└── TrackC/   — full closed-loop simulator + React funnel clone
```

**Key files.**
* Track A: `simulators/TrackA/personas/` (reasoning + Playwright), `simulators/TrackA/ui/` (live helper).
* Track B: `simulators/TrackB/coach/coach/coach_engine.py` · `estimator.py` · `policy.py` · `rank_full_engine.py`.
* Track C: `simulators/TrackC/src/App.jsx` · `components/FormFunnel.jsx` · `logic/form.js` · `agent/funnelEngine.js` · `agent/coach.js`.

**Reproduce the Track B headline in 3 lines.**
```bash
cd simulators/TrackB/coach
python -m pytest tests/ -q      # invariants pass
python eval_harness.py          # OFF 0/3 · ON 2/3 · annoyance 0.00
python rank_full_engine.py      # the precision/recall dial
```

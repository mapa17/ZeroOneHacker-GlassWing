# Team Glass Wing — Jury Report
### Zero One Hacker 2026 · UNIQA Online Funnel Drop-off Analysis & Adaptive AI Coach

---

## 📝 TL;DR
We built a multi-track simulation harness for the 9-step branching **UNIQA Privatarzt** online health insurance quote funnel to analyze why users drop off and how to retain them. The system features LLM-driven customer personas with demographic-aligned qualitative reasoning (Track A), a Python-based **stat-blind Bayesian state estimator** that infers user friction states purely from telemetry (Track B), and a closed-loop React/Vite web harness with a deterministic advisor warning coach (Track C). Our key finding was the **"LLM Compliance Gap"** (where LLM agents are too easily nudged to ~100% completion), though our stat-blind Python coach successfully demonstrated a lift from **0/3 to 2/3 at-risk persona conversions with a 0.00 annoyance rate**.

---

## 🎯 Problem
UNIQA's online calculator loses **~94% of digital starters** (yielding a low 5.6% conversion rate). The heaviest drops occur at the initial price presentation (step 3: 66% drop) and the final prior-insurance check (step 6: 78% drop). Standard funnel analytics record *where* users leave but fail to explain *why*—treating all drop-offs identically. 

Our core insight is that **a single drop-off number hides three distinct behavioral failures** affecting three customer segments:
1.  **Judith (Segment 1 - 30%):** Drops at the initial price due to a *channel contradiction* (the specific tariff she trusts an advisor to sell her is online-locked).
2.  **Franz (Segment 2 - 50%):** Drops at the final price due to a *trust breach* (the price changes because of insurance history).
3.  **Peter (Segment 3 - 20%):** Drops early due to a *complexity wall* (the input fields and birth date/SV forms overwhelm him).

To design high-yield interventions, we needed to simulate these qualitative failure modes and build an adaptive coach layer that infers *which* failure is happening live, routing the customer to the correct channel rather than pushing blanket online conversions.

---

## 🧭 Approach
We split our engineering pipeline into three parallel tracks to transition from qualitative user reasoning to deterministic mathematical control:

*   **Track A: Synthetic User Reasoning & UI Telemetry**
    *   **Qualitative Reason Prompting:** We linked sampled demographics (age, income, channel preference) from survey distributions directly to a step-level reasoning pipeline. The headless agent outputs structured JSON choices alongside a German-language *Begründung* explaining its internal hesitation and price sensitivity.
    *   **UI Automation & Telemetry:** We automated live browser click-throughs via Playwright to generate realistic mouse movements, hovers, and dwell times. We built a live chat assistant that reads active selections and page behavior to deliver contextual advice.
*   **Track B: Stat-Blind Bayesian State Estimation (Python Coach)**
    *   **Stat-Blind Estimator:** Instead of reading segment labels, we built a Python-only engine that infers user states (`orienting`, `evaluating`, `overwhelmed`, `ready`, `abandoning`) purely from noisy behavior signals (dwell timers, back-clicks, hovers, and selections).
    *   **Transparent Decision Policy:** The estimator updates a belief vector multiplicatively ($B \propto B \times P(\text{signal}|\text{state})$) with entropy decay to stay responsive to mid-session changes. A policy maps this to response tiers (`silent`, `ambient`, `inline`, `prompted`, `active`) with a mandatory human-readable reason, prioritizing silence for low-risk users.
*   **Track C: Closed-Loop Evaluation & The Realism Benchmark (Vite/Node App)**
    *   **Closed-Loop React Harness:** We cloned the 9-step branching Privatarzt funnel in React 19 / Vite 8 and linked it headlessly to a Node.js CLI agent simulator (`run-interactive-agent.mjs`) driven by Claude/GPT.
    *   **Advisor Warnings:** We implemented a deterministic JavaScript coach banner (`coach.js`) that intercepts the LLM customer and displays warning banners when advisor-routing is triggered, prompting them to reconsider.

---

## 💻 How to Run It

### 🐍 1. Track B — Bayesian Coach Demo (Python)
The Bayesian state estimator, demo spine, and parameter sweep are located in `simulators/TrackB/coach/`.

```bash
# Navigate to Track B's coach folder
cd simulators/TrackB/coach

# Install minimal dependencies
pip install -r requirements.txt

# Run the standalone demo (prints belief vectors & coach decisions per persona)
python run_demo.py --persona all

# Run the evaluation harness (generates OFF vs ON metric comparisons in extras/results/)
python eval_harness.py

# Run the unit test suite (validates estimator invariants and contract interfaces)
python -m pytest tests/ -q
```

### ⚛️ 2. Track C — Full Web App & CLI Simulation (JavaScript)
The React funnel dashboard and headless CLI pipeline are located in `simulators/TrackC/`.

```bash
# Navigate to Track C's root folder
cd simulators/TrackC

# Install dependencies (React, Vite, Lucide)
npm install

# Copy environment variables and configure your OPENAI_API_KEY
cp .env.example .env
# Open .env and set: OPENAI_API_KEY=sk-...

# Run the React 19 visual web app (Dashboard, Funnel UI, Logs Panel)
npm run dev
# Open http://localhost:5173

# --- Headless CLI Interactive Agent Simulation Pipeline ---
# Step A: Sample persona profiles from survey distributions
npm run profiles:sample -- --n 10 --seed 1

# Step B: Generate grounded system prompts using OpenAI (replaces <runId> with the timestamp printed above)
npm run persona:prompts -- --run <runId>

# Step C: Run the step-by-step LLM simulation loop with the coach enabled
npm run agent:interactive -- --run <runId> --verbose --enable-coach

# Step D: Analyze the drop-off and exit telemetry outputs
npm run agent:analyze -- --run <runId>
```

### 🧪 3. Track A — Synthetic Reasoning & Playwright UI
The Playwright automation and live coach chat helper are located in `simulators/TrackA/`.

```bash
# Navigate to Track A folders
cd simulators/TrackA/personas
npm install
npx playwright install chromium

# Create persona pool files
npm run create -- --n 10

# Run Playwright UI browser simulations with real mouse/click telemetry
# (Make sure to start the Track A UI dev server under simulators/TrackA/ui first!)
npm run live -- --run live_run_01 --limit 10 --concurrency 2
```

---

## 📈 Results

### 1. Track B — Python Bayesian Coach Performance
We evaluated identical scripted journeys across three personas with the Python coach turned **OFF** vs. **ON**:

| Persona | Segment | Conversion OFF → ON | State-Recovery Accuracy | Annoyance Rate | Tactical Interventions |
|---|---|---|---|---|---|
| **Franz** | S2 (Digital) | 0 → **1** (+1) | 0.67 | 0.00 | Caught at final price; triggered `save_progress` to prevent advisor routing. |
| **Peter** | S3 (Service) | 0 → **1** (+1) | 0.83 | 0.00 | Early overwhelm detected; gracefully exited and handed off to human support. |
| **Judith**| S1 (Hybrid) | 0 → 0 (+0) | 0.38 | 0.00 | **Deliberately left alone**; segment requires advisor support, silence maintained. |

*   **Headline Metric:** **0/3 → 2/3 Conversions, 0.00 Annoyance.** The Judith zero is a designed feature, not a failure: her segment relies on offline advisors, and the coach correctly stayed silent rather than badgering her.
*   **Mathematical Precision:** The estimator achieved a **1.00 abandon-precision** and **0% mis-routing across 6,000 simulated noisy trajectories**.
*   **Leonardo CPU Param-Sweep:** Sweeping entropy decay/likelihood floors over a 25-point grid revealed a strict **accuracy-vs-decisiveness trade-off**. High decay rates raise per-call accuracy but decrease the coach action frequency (action rate drops from 0.60 to 0.35).

### 2. Track A — Live Chat Helper Impact
*   Replaying **50 prior user drop-offs** with the telemetry-aware chat helper enabled led to **~10% purchase completion** and **a third progressing significantly further** than their baseline. The helper succeeded by clarifying form inputs early but could not overcome price objections.

### 3. Track C — The LLM "Compliance Gap"
*   In closed-loop testing, the LLM customer was **unrealistically cooperative**. In baseline runs, the LLM completed the funnel without dropping. When the coach warning was enabled, completion rates hit **~100%**. 
*   **Jury Takeaway:** Standard LLMs lack the inherent friction, attention span, and skepticism of real customers. Relying purely on cooperative agents overestimates coach effectiveness without physical calibration.

---

## 🛠️ What Worked / What Didn't

### What Worked
*   **Stat-Blind State Recovery:** In Track B, the belief vector successfully inferred Peter and Franz's states solely from non-labeled clickstream telemetry without reading segment tags.
*   **Silence as an Active Action:** Setting high threshold gates for the Bayesian policy ensured a **0.00 annoyance rate**. The coach remained silent for Franz on normal steps and only intervened when pricing anomalies hit.
*   **The Handoff Paradigm:** Treating a human advisor handoff as a successful retention path (routing Peter to a human rather than forcing him to buy online) dramatically improved user trust.

### What Didn't
*   **LLM Micro-Behavior Limitations:** LLMs cannot natively generate physical clickstream telemetry (mouse curves, hover ranges). Feeding telemetry directly from LLM prompts introduces extreme circularity. Telemetry must be generated by physical automation engines (like Playwright in Track A) or real browser logs.
*   **Judith Recall Failure:** Track B's abandon-recall for Judith was 0.0. Her segment disengages quietly without showing active "abandoning" behaviors, causing her to bypass the Bayesian abandon state.
*   **Model Circularity:** The personas and the Bayesian coach rules were authored by the same team. While the "stat-blind" constraint prevented direct label leaking, a subtle theoretical bias remains.

---

## 🔮 What We'd Do with Another 36 Hours
1.  **Playwright Mouse Telemetry Injection:** Record physical human cursor movements on the React cloned app and merge them with sampled profiles to train the Bayesian likelihood matrix on real, non-synthetic human noise.
2.  **Cluster-Variance Sweep on Leonardo:** Run SLURM parameter sweeps with $N$-jittered persona variations per segment to test if the coach handles *atypical* Franz personas correctly (learning the segment vs. memorizing the archetype).
3.  **Calibrate Decision Boundaries:** Set LLM transition probabilities directly from actual UNIQA production logs rather than hand-tuned hypotheses.

---

## 📂 Credits, Dependencies & Navigation

### Tech Stack & Libraries
*   **Python Stack:** `numpy`, `pytest` (used for Track B Bayesian coach and robustness tests).
*   **JavaScript Stack:** `React 19`, `Vite 8`, `lucide-react` (used for Track C funnel cloned app).
*   **CLI Simulator:** Node.js, `dotenv` (used for Track C headless CLI agent).
*   **Automation:** Playwright Chromium (used for Track A live mouse telemetry recording).
*   **Foundation Models:** OpenAI `gpt-5.4-mini` (CLI agent logic & prompt expansion), Claude 3.5 (architecture review).
*   **Dataset:** UNIQA segmentation survey (n=4,004), live funnel calculator capture (2026-05-13).

### Key Code Files Map
*   **Python Bayesian Coach:** [coach_engine.py](./simulators/TrackB/coach/coach_engine.py) (entry contract) | [estimator.py](./simulators/TrackB/coach/estimator.py) (Bayesian estimator) | [policy.py](./simulators/TrackB/coach/policy.py) (decision policy).
*   **JS Cloned Funnel & React App:** [App.jsx](./simulators/TrackC/src/App.jsx) (web UI) | [FormFunnel.jsx](./simulators/TrackC/src/components/FormFunnel.jsx) (cloned form) | [form.js](./simulators/TrackC/src/logic/form.js) (funnel logic).
*   **JS Headless Simulation Loop:** [funnelEngine.js](./simulators/TrackC/src/agent/funnelEngine.js) (agent funnel driver) | [coach.js](./simulators/TrackC/src/agent/coach.js) (opt-in JS warning coach).

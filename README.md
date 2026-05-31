# Team Glass Wing — Zero One Hacker 2026

**Team:** Vladislav Dolgov · Vladyslav Shundryk · Manuel Pasieka

---

## Project Overview

We built a simulation harness for the **UNIQA Privatarzt** online insurance quote funnel — a 9-step web form where real users frequently drop off before completing their application.

The system consists of three simulated components running together:

- **Web Form** — a faithful clone of the UNIQA Privatarzt funnel
- **Customer Simulator** — an LLM acting as a customer, driven by a sampled persona profile
- **Coach Simulator** — an LLM observing customer behavior and nudging them toward online completion

### How the customer simulation works

Three archetypal personas — *Judith* (hybrid, ~30% of traffic), *Franz* (digital-first, ~50%), and *Peter* (service-oriented, ~20%) — are defined with survey-derived attribute distributions. A sampling process draws a concrete individual from those distributions (age, income, channel preference, switch willingness, etc.), combines the sampled JSON profile with a narrative persona description, and uses the result as an LLM system prompt. The model then navigates the form step by step, responding with structured JSON actions and a German-language reasoning field at each step.

### How the coach works

The coach receives context on users actions on the web app to be able to infer to three persona archetypes, their motivations, and a per-step playbook. After each customer action it observes the updated form state and decides whether to send a short message or stay silent. It must always warn when the current selections would route the customer to an advisor (blocking online completion); otherwise it speaks only when it adds genuine value — and stays silent for friction-averse personas on a clear online path.

---

## Work Streams

From this shared base we worked in three parallel directions:

### Track A — Synthetic user reasoning
Generating rich, step-level explanations of *why* the simulated customer makes each decision — including internal hesitation, price sensitivity, and friction signals — with the goal of better predicting real drop-off moments from behavioral signals.

### Track B — Analytics-driven persona modeling
Feeding real funnel analytics into the coach so it can estimate which persona type it is currently observing and calibrate when to intervene vs. when silence is the better choice — with the goal of persona-aware nudges that don't alienate friction-averse customers.

### Track C — Full closed-loop evaluation
Running the minimal end-to-end system in a closed loop and measuring whether the coach actually shifts completion rates vs. a no-coach baseline. Key finding: LLM customer behavior did not match historic drop-off measurements, and the coach pushed online completion to ~100% — both unrealistic. The LLM proves too compliant and too easily nudged, lacking the real-world friction and inertia of actual customers.

---

## Repository Structure

```
simulators/
├── TrackA/   — Synthetic reasoning generator (Track A)
├── TrackB/   — Conversion Coach proof lane (Track B)
└── TrackC/   — Full closed-loop simulator (Track C)
```

Each simulator folder contains its own setup instructions and scripts.

---

## Presentation

A slide deck is available at [`presentation.html`](presentation.html) — open it in any browser, navigate with arrow keys or the Prev / Next buttons.

# CLAUDE.md

Guidance for working in this repository.

## What this project is

**UNIQA Coach** (package name `uniqa-coach`) is a **form/funnel test harness** that
clones the UNIQA "Privatarzt" (private-doctor health insurance) online quote funnel. It is
used to study where users drop out of the funnel and what choices they make.

There are exactly **two ways the funnel is exercised** (there is intentionally no
probabilistic batch simulator — it was removed):

1. **LLM customer simulation** — a Node CLI agent (`scripts/run-interactive-agent.mjs`)
   drives the headless funnel step by step, with an LLM acting as the customer from a
   sampled persona profile. Full traces + drop-off analysis are written to
   `test-results/<runId>/` (created locally, not committed).
2. **Human clickthrough** — a React/Vite web app (`src/`, `index.html`) where a person
   fills the funnel by hand. Modes: manual fill, in-app agent run, a coach dashboard, and
   a data-logs panel.

Both paths share the same funnel logic, validation, routing, classifier, and telemetry
shape, so a session looks the same regardless of who drove it.

## Tech stack

- **React 19** + **Vite 8**, ES modules (`"type": "module"`). JSX in `src/`.
- **lucide-react** for icons. No CSS framework — inline styles + `src/index.css`.
- CLI scripts are `.mjs` and import directly from `src/` (shared logic, no build step).
- **OpenAI API** for the interactive agent and system-prompt generation (default model
  `gpt-5.4-mini`). The in-app Agent tab uses a Claude client (`src/agent/api.js`).

## Commands

```bash
npm run dev          # Vite dev server (human clickthrough), usually http://localhost:5173
npm run build        # production build to dist/
npm run preview      # preview the production build

# LLM customer-simulation pipeline (see SETUP.md for the full flow)
npm run profiles:sample -- --n 10 --seed 1            # sample persona profiles → sessions/
npm run persona:prompts -- --run <runId>              # generate system prompts (needs OpenAI)
npm run agent:interactive -- --run <runId> --verbose  # step-by-step LLM agent (the simulation)
#   add --focused      to hide advisor-routing options on steps 0–6
#   add --enable-coach to turn on the advisor-warning coach (off by default)
npm run agent:analyze -- --run <runId>                # drop-off / pause / advisor_forward analysis
npm run persona:gen                                   # standalone single-persona JSON generator
npm run export:zip                                    # bundle a distributable export
```

There is **no test runner or linter** configured.

## Architecture

### The funnel (9 steps, 0–8)
Defined in `src/logs/constants.js` (`PAGE_NAMES`):

```
0 Absicherungsbereich      5 Persönliche Angaben
1 Versicherte Person       6 Bisherige Versicherungen
2 Geburtsdatum & SV        7 Beratungsort
3 Tarif-Auswahl            8 Ergebnis (outcome)
4 Zusatzleistungen
```

The funnel branches: step 0 (Krankenhaus coverage) and step 1 ("others" insured) jump
straight to the outcome (step 8); step 6 routes to either `online` or `beratung`
(advisor consultation). All routing lives in `src/logic/funnelRouting.js` and is mirrored
headlessly by `src/agent/funnelEngine.js` — **keep these two in sync.**

### Completion vs advisor_forward
Reaching step 8 is **not** the same as completing. `terminalStatus(form)` in
`src/logic/form.js` is the single source of truth:
- **`completed`** — stayed on the online path to the end (route `online`).
- **`advisor_forward`** — any advisor-routed session: Krankenhaus/other-person early jumps,
  non-online tariff, prior-insurance triggers, or any step-7 Beratungsort choice
  (including "Online Videoberatung"). Only the pure online path counts as a completion.

Only genuine completions count as conversions. This distinction is applied in both paths:
the LLM agent (`exitType: "advisor_forward"`, `advisorForward`/`advisorReasons` in
summaries + `analysis.json`) and the web app (`funnel_complete` event `status`, snapshot
`completed`/`advisorForward`/`reachedOutcome`).

### Coach (advisor warning) — opt-in
`src/agent/coach.js` `evaluateCoach(form)` is the **single, deterministic coach decision**,
shared by both paths. It returns a warning intercept **only** when the current selections
would route the user to an advisor (`evaluateOutcome(form).route === "beratung"`) — i.e. it
warns that an online completion isn't possible while that selection is kept — and `null`
otherwise. It is **disabled unless a flag is set**:
- **CLI agent:** `--enable-coach`. Each turn, if a valid action introduces an advisor
  trigger, the warning is injected into the prompt and the **same step is re-rendered once**
  so the LLM can reconsider; if it keeps the selection, the run proceeds (decision
  respected). Logged as coach events + `coachFired`/`coachWarnedSteps` in the summary.
- **Web app:** `?enable-coach` URL param. `evaluateCoach(form)` is recomputed every render
  and shown as a banner in `FormFunnel` (not on the result page).

When the flag is absent, there is no coach and behavior is unchanged. Note: the coach
warns whenever ANY advisor trigger is active — including step-7 Beratungsort selections,
since all advisor-routed sessions (even "Online Videoberatung") count as `advisor_forward`.
(The legacy persona-specific `runCoachStub` was replaced by this. The web "Coach" mode
tab — `CoachDashboard` — is a separate persona-detection analytics panel, not this warning.)

### Key modules

- `src/logic/form.js` — form state (`freshForm`), `validateStep`, premium calc, outcome
  evaluation, `terminalStatus`. Single source of truth for validation/completion; the CLI
  agent uses the same rules.
- `src/logic/funnelRouting.js` — forward/back step transitions and early-exit detection.
- `src/agent/funnelEngine.js` — headless state machine mirroring `App.jsx` next()/back();
  driven by the LLM agent.
- `src/logic/personaProfileGenerator.js` — `PersonaSampler` / `generateTrafficMix`: sample
  persona profiles from the population distributions in `personas/personas.json`.
- `src/logic/personaClassifier.js` — turns a session snapshot into behavioral signals,
  a drop-off read, and a persona match (used by the web Coach tab and the agent analysis).
- `src/agent/*` — the interactive LLM loop: action schema, prompt building, OpenAI client,
  coach intercept, interaction logging, exit classification.
- `src/components/*` — UI panels: `FormFunnel`, `AgentPanel`, `CoachDashboard`,
  `DataLogsPanel`, shared `ui.jsx`.
- `src/logs/useTracking.js` — in-app per-page telemetry (dwell, clicks, fields, hovers).

### Personas
`personas/personas.json` holds three UNIQA market segments (the online-funnel-relevant
ones) with real survey-derived distributions and a 30/50/20 traffic mix. Archetypes:
`judith` (segment_1), `franz` (segment_2), `peter` (segment_3) — markdown sheets in
`personas/`.

## Data and privacy

- **PII is never stored raw.** `src/logs/constants.js` (`PII_FIELDS`) and the tracking
  layer record only `filled`/`length` for personal fields; only enumerated choice fields
  store their value. Preserve this when touching telemetry. See `chat/README.md`.
- `test-results/` (generated runs) and `dist/` are local-only and excluded from exports.

> Note: the probabilistic batch simulator (`personaSimulator.js`, `profileToSim.js`,
> `profileFormFill.js`, `benchmarkValidation.js`, `personaStats.js`, the `StatsLab` tab,
> and the `test:personas` / `test:agent` / `validate:benchmarks` scripts) was **removed**
> on purpose — the funnel is exercised only by the LLM agent or a human. `REALISM.md` and
> `SETUP.md` may still mention it; treat the two paths above as authoritative.

## Language note

The app UI and many log strings are in **German** (Austrian). Persona data and code
comments are in English. Keep user-facing funnel strings in German.

## ⚠️ Security

`.env` currently contains a **real-looking `OPENAI_API_KEY`**. Do not commit `.env`, and
treat that key as compromised — it should be rotated and replaced with `.env.example`
placeholder usage as described in `SETUP.md`.

# UNIQA Personas & Live Coach

Research project for the UNIQA **Privatarzt** online insurance funnel: synthetic Austrian customer personas, realistic drop-off simulation, and an on-screen **AI chat coach** that tries to reduce abandonment.

Two packages work together:

| Folder | Role |
|--------|------|
| **`ui/`** | React funnel + live chat coach + developer stats dashboard |
| **`personas/`** | Persona sampling, LLM funnel walks, Playwright live runs, coach experiments |

## What this repo does

1. **Sample personas** from segment distributions (Judith / Franz / Peter archetypes).
2. **Simulate the funnel** — either headless LLM checks or real browser runs with mouse/click telemetry.
3. **Analyse drop-offs** — where people leave, why, and which patterns correlate with purchase.
4. **Run a live coach** — chat helper reads form state + tracking, answers questions, and (in experiments) lets personas reconsider before they drop.

## Quick start

### 1. Secrets (required for LLM features)

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...
```

Never commit `.env`. Only `.env.example` is tracked.

### 2. UI (funnel + coach)

```bash
cd ui
npm install
npm run dev
```

Open http://localhost:5173 — the chat coach calls OpenAI via a **local dev proxy** (`/api/coach-chat` in `vite.config.js`), using the key from the root `.env`.

### 3. Persona tools

```bash
cd personas
npm install
npx playwright install chromium   # first time only, for live runs
```

**Create personas and run funnel checks (no browser):**

```bash
npm run create -- --n 10
npm run checks
```

**Live UI simulation (Playwright + real tracking):**

```bash
# Start ui dev server in another terminal first
npm run live -- --run live400 --limit 50 --concurrency 3 --speedup 12
```

**Coach experiment (replay dropped personas with the coach):**

```bash
npm run coach-experiment
# Output: personas/test-results/coach-exp-50/
#   sessions/       — new coached runs
#   before_after/   — old vs new paired per persona
#   comparison.json — aggregate uplift
```

**Rebuild coach stats for the UI** (after large live runs):

```bash
npm run coach-stats
npm run coach-impact
```

## Project layout

```
.
├── .env.example          # template — copy to .env at repo root
├── ui/
│   ├── src/components/   CoachChat.jsx, FormFunnel, …
│   ├── src/logic/        coach engine, screen context, proactive triggers
│   └── src/data/         stepCoachStats.json, coachImpact.json (aggregates)
└── personas/
    ├── personas/         segment definitions + prompt template
    ├── scripts/          run-live, run-checks, coach experiment, …
    ├── src/agent/        liveFunnelDriver, personaFunnelAgent
    └── test-results/     generated run output (gitignored)
```

## Privacy & what not to push

- **`.env`** — your OpenAI API key (gitignored).
- **`personas/test-results/`** — large session JSON from runs (gitignored). Contains synthetic persona data and telemetry, not real customers, but kept local by default.
- **`personas/personas-pool*/`** — generated profile batches (gitignored; recreate with `npm run create`).

Committed aggregate files in `ui/src/data/` (`stepCoachStats.json`, `coachImpact.json`) are **summary statistics only** — no names or API keys — so the coach works out of the box.

## Requirements

- Node.js 20+
- OpenAI API key for persona decisions and the chat coach
- Chromium via Playwright for live runs

## License

Internal / research use — add a license before public release if needed.

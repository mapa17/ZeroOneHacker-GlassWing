# UNIQA funnel UI

React app for the **Privatarzt online quote funnel**, the **live chat coach**, and developer-only analytics (Coach dashboard, Daten tab).

## Setup

From the **repo root**, copy secrets once:

```bash
cp .env.example .env   # set OPENAI_API_KEY
```

Then:

```bash
npm install
npm run dev
```

Open http://localhost:5173.

The coach chat uses `/api/coach-chat` — a Vite dev proxy that forwards to OpenAI using the root `.env` key (never exposed in the browser bundle).

## Modes

| Mode | Description |
|------|-------------|
| Default | Funnel + floating **UNIQA Helfer** chat coach |
| Coach | Developer dashboard (predictions, stats — not shown to end users) |
| Daten | Raw tracking JSON for debugging |

## Build

```bash
npm run build
npm run preview
```

## Coach data

Aggregated patterns live in `src/data/stepCoachStats.json` and `coachImpact.json`. Regenerate from simulation runs:

```bash
cd ../personas && npm run coach-stats && npm run coach-impact
```

## See also

Root `README.md` for persona simulation and coach experiments.

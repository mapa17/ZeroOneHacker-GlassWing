# UNIQA persona simulation

Tools to create synthetic Austrian insurance shoppers, walk them through the Privatarzt funnel, and measure drop-offs — with optional **live Playwright** runs against `../ui`.

## Setup

```bash
npm install
npx playwright install chromium   # once, for live runs
```

API key (repo root):

```bash
cp ../.env.example ../.env
# OPENAI_API_KEY=sk-...
```

## Main commands

| Command | What it does |
|---------|----------------|
| `npm run create -- --n 50` | Sample personas → `personas-pool/` (gitignored) |
| `npm run checks` | LLM walks funnel page-by-page (no browser) |
| `npm run live -- --run live400 --limit 50` | Real UI + telemetry (needs `ui` dev server) |
| `npm run coach-stats` | Merge runs → `../ui/src/data/stepCoachStats.json` |
| `npm run coach-impact` | Project coach uplift → `../ui/src/data/coachImpact.json` |
| `npm run coach-experiment` | Replay 50 dropped personas **with** the live coach |

### Live run example

Terminal 1: `cd ../ui && npm run dev`  
Terminal 2:

```bash
npm run live -- --run live400 --limit 100 --concurrency 3 --speedup 12
```

### Coach experiment

Replays personas that **already dropped** in a source run (default `live400`), lets them read the on-screen coach, ask questions, and reconsider. Output:

```
test-results/coach-exp-50/
├── before_after/*.pair.json   # original + coached side by side
├── sessions/                  # new runs
└── comparison.json
```

(`test-results/` is gitignored except `README.md`.)

## Out-of-scope stops (excluded from conversion %)

1. Step 0 — Krankenhaus product selected  
2. Step 1 — insuring someone else  
3. Step 3 — advisory-only tariff (Plus / Premium)  
4. Step 6 — health question answered “ja”  

## Output layout

```
test-results/<runId>/
├── sessions/*.json
├── summary.json
└── index.csv          # some runs
```

See root `README.md` for the full project overview.

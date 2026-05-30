# UNIQA Coach — setup on a new machine

This guide gets the project running after unpacking the export zip.

## Requirements

| Tool | Version |
|------|---------|
| **Node.js** | 20.x or newer (LTS recommended) |
| **npm** | 10+ (bundled with Node) |
| **OpenAI API key** | Required for interactive agent & prompt generation |

Check versions:

```bash
node -v    # expect v20.x or v22.x
npm -v
```

## 1. Unpack

```bash
unzip uniqa-coach-export-*.zip
cd "UNIQA Coach"
```

## 2. Install dependencies

```bash
npm install
```

This installs React, Vite, and dev tooling. No global packages needed.

## 3. Configure API key

```bash
cp .env.example .env
```

Edit `.env` and set your key:

```env
OPENAI_API_KEY=sk-...
```

Optional: change the model (default `gpt-5.4-mini`):

```env
OPENAI_MODEL=gpt-5.4-mini
```

**Never commit or share `.env`** — it is excluded from the export zip.

## 4. Run the web app (funnel UI)

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

## 5. Generate persona test data (first-time pipeline)

The interactive agent expects a **run folder** under `test-results/<runId>/` with `sessions/` and `system-prompts/`.

### Step A — Sample profiles

```bash
npm run profiles:sample -- --n 10 --seed 1
```

Note the run id printed (timestamp folder under `test-results/`). This only samples
persona profiles into `sessions/` — there is no funnel simulation here; behaviour comes
from the LLM agent (below) or a human in the web app.

### Step B — System prompts (needs OpenAI)

```bash
npm run persona:prompts -- --run <runId>
```

### Step C — Interactive agent loop

```bash
# Full run (all personas in that run)
npm run agent:interactive -- --run <runId> --verbose

# Online-only choices on steps 0–6 (recommended for funnel testing)
npm run agent:interactive -- --run <runId> --focused --limit 5 --verbose

# Single persona
npm run agent:interactive -- \
  --profile test-results/<runId>/sessions/profile_franz_123.json \
  --prompt test-results/<runId>/system-prompts/profile_franz_123.md
```

### Step D — Analyze drop-offs / pauses

```bash
npm run agent:analyze -- --run <runId>
```

Outputs: `interactive-sessions/analysis.json`, `dropoffs.csv`, `pauses.csv`.

## 6. Other useful commands

```bash
npm run profiles:sample -- --n 25 --seed 1   # sample more profiles for a run
npm run persona:gen 1 --pretty               # print one segment-1 persona JSON to stdout
```

> The probabilistic batch simulator and its commands (`test:personas`, `test:agent`,
> `validate:benchmarks`) and the in-app Statistik-Labor tab were **removed**. The funnel is
> exercised only by the LLM agent (sections 5C–D) or a human in the web app (section 4).
> Parts of [REALISM.md](./REALISM.md) still describe the old simulator — ignore those.

## What is in the export zip

| Included | Excluded (recreated locally) |
|----------|------------------------------|
| `src/` — app + agent logic | `node_modules/` — run `npm install` |
| `scripts/` — CLI tools | `.env` — copy from `.env.example` |
| `personas/` — segment definitions | `test-results/` — regenerate with commands above |
| `package.json`, `package-lock.json` | `dist/` — run `npm run build` |

## Troubleshooting

**`No OPENAI_API_KEY found`**
- Create `.env` from `.env.example` and set a valid key.

**`Missing system-prompts/`**
- Run `npm run persona:prompts -- --run <runId>` after `npm run profiles:sample`.

**Port already in use (Vite)**
- `npm run dev -- --port 5174`

**Interactive agent completes too often**
- Use `--focused` to hide advisor-routing options on early steps.

## Folder layout (quick reference)

```
UNIQA Coach/
├── src/                 # React funnel + agent modules
├── scripts/             # CLI entry points
├── personas/            # personas.json + prompt templates
├── test-results/        # generated runs (created locally)
├── .env.example         # API key template
├── SETUP.md             # this file
└── REALISM.md           # simulation realism notes
```

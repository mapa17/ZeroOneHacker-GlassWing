# MANIFEST — what every file is, and which is canonical

So nobody edits the wrong thing.

## In this bundle

| File | Role | Status | Goes to (in repo) |
|---|---|---|---|
| `src/agent/coach.js` | The coach: estimator + likelihood + policy + engine + scope routing | **CANONICAL — wire this in** | `src/agent/coach.js` |
| `src/agent/coachAdapter.js` | Seam: web telemetry → §1 signals → coach → intercept | **CANONICAL — wire this in** | `src/agent/coachAdapter.js` |
| `src/agent/coach.test.mjs` | 17 tests: brain, scope boundary, THE WALL | Optional (CI) | `src/agent/` or delete |
| `src/agent/adapter.test.mjs` | 20 tests: telemetry→coach, 3 personas, scope route | Optional (CI) | `src/agent/` or delete |
| `README_MERGE.md` | The 10-minute merge steps | Read first | — |
| `INTEGRATION.md` | Full detail: every seam, every decision | Reference | — |
| `python-sync/` | One change to keep the Python lane consistent | For Python owner | `glasswing/coach/` |
| `package.json` | `type: module` — lets the tests run standalone | Do **not** copy into the app | — |

## In the existing web app

| File | What to do |
|---|---|
| `src/agent/coachStub.js` | **DEPRECATED.** Stop importing it; delete after the swap works. |
| `src/agent/interactionLogger.js` | One-line edit (see README_MERGE step 2). |
| `src/agent/coachState.js` | One-line edit; keep `createCoachIntercept` / `pageModificationsFromIntercept` — the adapter matches their shape. |
| `src/agent/funnelEngine.js`, `actionSchema.js`, `applyAction.js` | **Unchanged.** |

## Source-of-truth chain

```
glasswing/coach/*.py   ──ported 1:1──►  src/agent/coach.js   ──used by──►  src/agent/coachAdapter.js
   (reference spec)                       (runs in the app)                   (the seam)
```

One deliberate divergence from the Python source: `_inferSegLean` was hardened
for the real per-event telemetry stream. Mirror it back — see `python-sync/`.

## Verified

`coach.test.mjs` → 17 passed. `adapter.test.mjs` → 20 passed. (Node 18+.)

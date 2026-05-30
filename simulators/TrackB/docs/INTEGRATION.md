# Merging the Glass Wing coach into the web app

This wires the real Python coach (the stat-blind Bayesian estimator + policy)
into the `uniqa-coach` web app, replacing the placeholder `src/agent/coachStub.js`.

## Alignment with the UNIQA track objective (read first)

The track spec (`Track_AI_Guided_Conversion_Flow_EN.md` §3–§4, README "What
Conversion Means") is explicit on two points the original coach violated. The
refactor brings the code into line:

**1. Conversion = online completion only. Handoff is NOT a coaching goal.**
The spec: *"conversion = online purchase only … advisor handoffs … do not count
as conversion for this track … advisor handoff only as an exit for out-of-scope
paths, not as a coaching goal."* The original policy used `handoff` as a coaching
response for in-scope Peter (the graceful-exit rule), and `eval_harness.py`
counted that handoff as a conversion (`QUALIFIED_OK[S3]=True`). Both are
misaligned. **Now:** the policy never emits `handoff` as a coaching action. For
in-scope overwhelm it **simplifies to keep the user online** (the spec's named
intervention). The humane "don't pressure a distressed user" intent is preserved
as a gentle, low-invasiveness *online* nudge — not an advisor push.

**2. Out-of-scope paths are routed cleanly and not coached.**
The spec scopes coaching to the private-doctor / "myself" / Start-Optimal path;
hospital, "others", Opt.Plus/Premium, and prior-private-insurance route to an
advisor with no coaching. **Now:** `CoachEngine` detects an out-of-scope choice
from behaviour (a `select` of `krankenhaus`/`others`/`optplus`/`premium`, or
`privatVersichert7 = ja`), emits **one** clean `handoff` tagged `scope_exit:true`,
then stays silent. `runCoachOnSession` returns `routedOutOfScope`. THE WALL is
intact — this reads observed *choices*, never a segment label.

> **DECISION YOU NEED TO MAKE (affects your REPORT headline).** Under the track's
> online-only definition, Peter's old handoff "conversion" no longer counts. The
> aligned design instead aims Peter at a *real* (track-valid) online completion
> via simplify. Two consequences:
> - Update `eval_harness.py` `QUALIFIED_OK` to online-only (`{S1:False, S2:False,
>   S3:False}` for the primary metric), or keep the per-segment view strictly as
>   a clearly-labelled **secondary** diagnostic — but the **headline** must be
>   online-only to match the track.
> - Re-state the result accordingly: the honest track-aligned headline is about
>   online completions + correct out-of-scope routing + zero annoyance, not
>   "2/3 including a handoff." Decide how you want to frame it and I'll redo the
>   eval numbers and the REPORT paragraph.

---

## What's in this drop

| File | What it is |
|---|---|
| `coach.js` | **The brain, ported 1:1 from Python** (`estimator.py` + `likelihood.py` + `policy.py` + `coach_engine.py`). Framework-agnostic ESM — runs in the browser and in Node. No LLM, no network: deterministic and auditable, same as the Python lane. |
| `coachAdapter.js` | The seam. Turns the app's telemetry (`events` array from `useTracking` / `personaSimulator`) into §1 signal events, runs the coach over a session, and maps the §2 action back to the app's intercept shape. |
| `coach.test.mjs`, `adapter.test.mjs` | 28 tests. Verify the port matches the Python coach and that all three personas route correctly end-to-end from web telemetry. |

Run the tests: `node coach.test.mjs && node adapter.test.mjs` (a `package.json` with `type: module` is included).

## Where it plugs in

`coach.js` exports the same primitives as the Python `coach` package
(`BayesianCoachEstimator`, `eventToLikelihood`, `decide`, `CoachEngine`).
`coachAdapter.js` gives you two entry points:

- **`runCoachOnSession(snapshot)`** — the faithful, per-event path. Feed it a
  session snapshot (what `personaSimulator.simulateSession()` returns, or
  `useTracking.buildSnapshot()`), get back the action timeline + final action +
  inferred segment lean. This is the analog of the Python `eval_harness.py`.
- **`runCoach({ snapshot, premium })`** — a drop-in with the same return shape
  as `runCoachStub` (`{ intercept, reason, pageModifications }`) for the existing
  call site.

### Three call-site edits to finish the swap

1. **Replace the stub.** Wherever `runCoachStub(...)` is called, call the adapter
   instead. Drop `profile.persona_id` — the coach infers the segment lean from
   the belief trajectory (THE WALL). Do **not** pass any label in.

2. **`src/agent/interactionLogger.js`** hardcodes `triggerStep: 4`. The real coach
   can fire at different steps for different users (Peter early, Franz at final
   price), so make it dynamic:
   ```js
   // logCoachEvent(event)
   triggerStep: event.triggerStep ?? 4,
   ```

3. **`src/agent/coachState.js`** gates the banner to `step < 5`:
   ```js
   // describeCoachForStep — was: if (!coachState || step < 5) return "";
   if (!coachState) return "";   // let the policy decide timing, not a fixed floor
   ```

You can keep using `coachState.createCoachIntercept` / `pageModificationsFromIntercept`
unchanged — the adapter's output matches their shape. (The inline `actionToIntercept`
in `coachAdapter.js` is a mirror; swap it for the real import once wired.)

## Integration decisions — read these, they change behaviour

These are the seams where the two lanes' models don't line up 1:1. Each is
isolated and labelled in the code.

### 1. Step vocabulary (the big one)
The JS funnel is 0–8; the coach's steps are named. The default map in
`coachAdapter.js` (`STEP_NAME`) is **online-journey-faithful**: it makes step 6
the `finalprice` step so Franz's `save_progress` mechanic is reachable.

Two things to know about *this* funnel:
- **Online journeys only traverse steps 0–6, then jump to the result (8).**
  Step 7 (Beratungsort) is on the advisor route only. So a position map
  (7→finalprice) would mean the coach *never sees* `finalprice` on a normal run.
  That's why the default puts `finalprice` at step 6.
- **`calcPremium` ignores health data** (it depends only on tarif + addons). So
  the price does not actually change after the health profile — meaning Franz's
  "the price changed" trust breach has **no real price-delta event** in the
  current funnel. The coach still fires on his abandon signals (back + cancel
  hover), but if you want the REPORT's Franz story to be literally true in the
  demo, either (a) make `calcPremium` health-dependent, or (b) add an explicit
  price-reveal step. **Team decision — flagged, not silently chosen.**

### 2. Dwell is synthesised
The app emits no discrete `dwell` event — dwell is accumulated per page. The
adapter reconstructs a `dwell` signal per page from page-enter timestamps and
feeds it **right after** the page's `enter` (you dwell, then act), so in-page
hover/back signals land after and dominate at exit. Dwell is a primary signal
for `overwhelmed`/`ready`, so this matters.

### 3. Field events are aggregated
`personaSimulator` emits one `field` event *per character*. Fed raw, that's ~20
`edit_clean` updates per field, which would bias the belief hard toward `ready`.
The adapter collapses to **one `field_edit` per (step, field)**.

### 4. `edit_quality` is not emitted (signal gap)
The §1 contract has `edit_quality ∈ {clean, hesitant, corrected}` — Peter's
clearest pre-price tell. The app doesn't emit it, so the adapter defaults to
`clean`. **Consequence:** Peter's overwhelm currently rides on stalled dwell +
back-nav, not on hesitant edits. To restore the full tell, have
`personaSimulator`/`useTracking` emit `edit_quality` (e.g. derive `corrected`
from backspace/edit-churn, `hesitant` from long inter-keystroke gaps).

### 5. Hover targets map partially
`cancel_button`, `tarif_card_optplus`/`advisory_badge_optplus` → `optplus_row`,
`tarif_card_premium` → `premium_row`. The matrix also knows `glossary_term` and
`phone_icon`, which the sim doesn't emit yet — add them if you want those tells.

### 6. Seg-lean inference was hardened (one deliberate deviation)
`run_demo.py` labels `infer_seg_lean` a "crude placeholder... refine later", and
it reasons over `states[:3]` — the *first 3 events*. That assumed the
~1-event-per-step `fake_signals` granularity. The real telemetry stream emits
many events per step, so `states[:3]` no longer covers the first 3 *steps* and
Peter's early overwhelm fell outside it. The ported `CoachEngine._inferSegLean`
reasons over **per-step** top-states instead (granularity-invariant).
**Action:** mirror this back into `coach/coach_engine.py._infer_seg_lean` so the
two lanes stay in sync (interfaces.md rule: change the contract, then both sides).

### 7. §2 → intercept mapping
`action_tier` `silent`/`ambient` → no banner. `inline`/`prompted`/`active` →
intercept with `type = channel` (`chat` | `handoff` | `save_progress` | …),
`message`, and a `priceReframe` carrying the premium on `save_progress`. Note:
the real policy does **not** highlight add-ons, so `highlightAddon` is always
null here — unlike the stub's Franz `addon_suggestion` path, which has no
equivalent in the real coach.

## Recommended sequencing

1. Wire `runCoachOnSession` into the **sim/eval path** first
   (`personaSimulator` → snapshot → coach). It's fully working now and is the
   faithful analog of `eval_harness.py` — it can reproduce the 0/3 → 2/3 result
   *inside the web app*, which is a strong demo asset.
2. Then wire `runCoach` into the **interactive LLM-agent path**
   (`run-interactive-agent.mjs`). That path emits per-turn actions, not the rich
   per-event telemetry, so it needs a small change to emit §1 signals per turn —
   send me that file and I'll write the exact swap.

## What I'd need to go further
- `src/data/personas.js` (the `sim` blocks) → to build the JS eval harness that
  reproduces the five rubric metrics + the 0/3→2/3 table over real sim runs.
- `scripts/run-interactive-agent.mjs` → to wire the coach into the live agent loop.

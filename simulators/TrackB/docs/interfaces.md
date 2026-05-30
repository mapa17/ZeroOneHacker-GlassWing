# interfaces.md — Team Glass Wing

The two contracts that let three people build in parallel. Lock these; build against stubs until the real components land. If a field changes, change it **here first**, then in code.

- **Signal contract** — Web/persona layer → Coach (teammate #2 emits, you consume)
- **Action contract** — Coach → Web/chat/analytics layer (you emit, teammate #1 + #2 consume)

---

## 1. Signal contract (Web → Coach)

One event per user interaction. The persona agent + web sim emit these; the coach consumes the stream.

```json
{
  "session_id": "s_0427",
  "t_ms": 18450,
  "step": "tariff",
  "event_type": "hover",
  "dwell_ms": 4200,
  "nav_vector": 0,
  "target": "cancel_button",
  "value": null,
  "history": ["coverage", "whom", "personal", "tariff"],
  "chat_text": null
}
```

| Field | Type | Meaning |
|---|---|---|
| `session_id` | str | One persona run. |
| `t_ms` | int | Ms since session start. |
| `step` | enum | `coverage` `whom` `personal` `tariff` `addons` `person` `history` `finalprice` `closing` |
| `event_type` | enum | `enter` `dwell` `hover` `toggle` `back` `select` `field_edit` `tab_blur` `chat_msg` `exit` |
| `dwell_ms` | int | Time on current step at emit. |
| `nav_vector` | int | `+1` forward, `0` same, `-1` back. |
| `target` | str/null | Element: `optimal_row`, `optplus_row`, `cancel_button`, `glossary_term`, `phone_icon`, … |
| `value` | str/null | Payload for `select`/`field_edit` (e.g. `"optimal"`). |
| `edit_quality` | enum/null | For `field_edit` only: `clean` `hesitant` `corrected`. Peter's clearest pre-price tell (JSON: "filling fields hesitantly or incorrectly"). `hesitant`/`corrected` raise `P(overwhelmed)` on early steps. |
| `history` | str[] | Steps visited, in order. |
| `chat_text` | str/null | If `event_type == chat_msg`, the user's typed message. |

> **NON-CIRCULARITY RULE (enforced at this boundary):** the event must **never** contain the persona's segment or true state. No `persona`, no `segment`, no `label`. The coach infers identity only from the evolving signal trajectory. Teammate #2: the agent behaves in-character but does not announce who it is.

---

## 2. Action contract (Coach → Web)

One action per coach decision (including the decision to do nothing).

```json
{
  "session_id": "s_0427",
  "t_ms": 18460,
  "action_tier": "active",
  "channel": "chat",
  "message": "Your final price reflects your health profile — €4 above the estimate. Here's why, and you can still finish online now.",
  "reason": "P(abandoning)=0.71 at finalprice; cancel-hover + back-nav; price-gap detected; segment prior leans S2 (fast early, late spike).",
  "belief": {"orienting":0.04,"evaluating":0.10,"overwhelmed":0.07,"ready":0.08,"abandoning":0.71}
}
```

| Field | Type | Meaning |
|---|---|---|
| `action_tier` | enum | `silent` `ambient` `inline` `prompted` `active` (see ladder below) |
| `channel` | enum/null | `none` `tooltip` `inline` `chat` `handoff` `save_progress` |
| `message` | str/null | User-facing copy. `null` when `silent`. |
| `reason` | str | **Mandatory.** Human-readable why. This is the jury's "visible reasoning." Never empty. |
| `support_tone` | enum | **Derived** emotional-support tone: `step_back` `low_pressure` `warm_concrete` `reassure` `cold_factual` `warm_exit` `neutral`. Computed from state × segment — articulates the tone behind the action, never overrides the tier. `[DESIGNED]`, not affect-detected. |
| `belief` | obj | The 5-state vector at decision time. Powers the live demo viz. |

**`save_progress` is Franz's escape hatch.** The JSON pairs "save progress / resume later" with "no advisor needed" — it lets the coach help an abandoning Franz *without* the handoff his segment rejects. Distinct from `handoff` on purpose.

**Tier ladder (least → most invasive):**
`silent` (no-op, default) · `ambient` (passive cue, e.g. underline a term) · `inline` (one line under the element) · `prompted` (offer chat, user opts in) · `active` (open chat / fire handoff). Opening the chat is `prompted` or `active` — it has a cost and is gated by confidence, same as any action.

---

## 3. State estimator spec (your module, for reference)

**Belief vector**, always normalised to sum 1:
`B = [P(orienting), P(evaluating), P(overwhelmed), P(ready), P(abandoning)]`

**Update rule (Bayesian, multiplicative):**
```
B_new[s]  ∝  B_old[s] × L[signal][s]
then renormalise so Σ B_new = 1
```
`L[signal][s]` = likelihood of seeing this signal given state `s`. One small matrix: rows = signal patterns, cols = 5 states.

**Two mandatory guards (one line each):**
- **Likelihood floor:** never let any `L` cell be 0 — clamp to ≥ 0.1. Stops a state from collapsing to zero and never recovering.
- **Decay to uniform:** each step, blend `B` a little toward uniform (`B = 0.9·B + 0.1·uniform`). Stale evidence fades; the coach stays responsive to a state change mid-session.

**Identity emerges, it is not given.** Segment is read *from the trajectory*, not from a label: e.g. an early `P(abandoning)` spike at `finalprice` → S2-like (Franz); a late spike after hovering advisory-locked tariffs → S1-like (Judith); high `P(overwhelmed)` from `hesitant`/`corrected` field-edits before `tariff` → S3-like (Peter). This segment read only adjusts the decision policy's priors/tolerances — it never enters the estimator.

**THE WALL (the deep non-circularity guarantee).** The estimator is **stat-blind**: it never reads `personas.json`, never sees NPS, segment share, or any survey value. It consumes *behaviour only*. The coach infers **state** from behaviour — it does **not** infer **who you are** from stats. Segment statistics are allowed to shape the *policy's response* once a state is inferred (see §4), but they are declared there as `[DESIGNED]` design inputs, never as something the coach "discovered." Keep this wall and the priors are a feature; blur it and they become circularity (see `METHODOLOGY.md` Limitation 2).

**Example update:** `event_type=hover, target=cancel_button, nav_vector=-1` at `finalprice` → `L` scales `P(abandoning)` up hard, dampens `P(ready)`; after renormalise, `P(abandoning)` dominates → policy fires `active`/`chat`.

---

## 4. Decision policy spec (your module, for reference)

Input: `argmax(B)` + confidence (how peaked `B` is) + `step` + segment prior (from trajectory).
Output: `action_tier` + `channel` + `message` + `reason`.

Rules of thumb (full matrix lives in `coach/policy.py`):
- Low confidence **or** low risk → `silent`. Silence is the default, not the absence of a choice.
- `ready` → stay out of the way; clear friction only.
- `overwhelmed` → simplify / `prompted` chat / warm handoff (S3 tolerance: handoff is a win).
- `abandoning` + high confidence → the one earned `active` interruption.
- `abandoning` + S2-like trajectory → `save_progress`, **not** handoff (Franz rejects advisor pushes).
- **Graceful exit (emotional-weight rule):** `overwhelmed` + low-NPS lean + low confidence → stop pushing, offer a human (`prompted`/`handoff`). The humane version of the annoyance guard — when emotional cost is high and certainty is low, the right support is to step back, not try harder.

**Policy priors from `personas.json` — all `[DESIGNED]`, none inferred.** These shape the *response* after a state is inferred; they are encoded segment facts, never coach discoveries:
- **NPS** (Judith +17, Franz +1, Peter −6): low-NPS trajectory → suppress `reassurance`/trust-badge interventions (brand-warmth falls flat); favor concrete simplification + actionable handoff.
- **`online_purchase_option`** as purchase criterion (Judith 11%, Franz 36%, Peter 13%): high value → online completion is the real target; low value → handoff is a legitimate success (see metric below).
- **`low_engagement_only_what_needed`** (all 55–63%): universal over-intervention risk → reinforces silence-as-default.

**Dual metric is PER-PERSONA, not global** (the JSON itself disagrees on what conversion means):
| Persona | Primary (online) | Secondary (qualified) includes handoff? |
|---|---|---|
| Franz (S2) | online completion | **No** — handoff = failure (JSON: "avoid pushing advisor") |
| Judith (S1) | online completion | **Yes** — JSON: "smooth handoff… counts as conversion" |
| Peter (S3) | online completion | **Yes** — JSON: "conversion = qualified service contact" |

---

## Build-in-parallel summary

| You build against… | They build against… |
|---|---|
| A **fake signal emitter** that replays JSON events matching §1 | A **fake coach** that returns canned §2 actions |
| Swap stub → real stream when web layer lands | Swap stub → real coach when your module lands |

Nothing blocks. The two stubs meet in the middle.

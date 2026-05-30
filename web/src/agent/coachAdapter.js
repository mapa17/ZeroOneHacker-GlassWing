/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CANONICAL ADAPTER — the seam between web telemetry and the coach.         │
 * │ Lives in the web app at: src/agent/coachAdapter.js                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * coachAdapter.js — the seam between the web app's telemetry and the coach.
 *
 * The web app (useTracking / personaSimulator) emits a session `events` array.
 * The coach consumes §1 signal events (interfaces.md §1). This module translates
 * one into the other, then runs the coach engine over the stream.
 *
 * It also exposes runCoach(), a drop-in with the same signature as
 * runCoachStub() so the existing call site can be swapped with minimal change.
 *
 * --- INTEGRATION DECISIONS (read INTEGRATION.md) --------------------------
 *  1. STEP MAP: the JS funnel (0-8) and the coach's step vocabulary do not
 *     line up 1:1. The default below keeps Franz's "finalprice" mechanic
 *     reachable on the online journey (steps 0-6). Change STEP_NAME in ONE
 *     place if the team designates a different final-price moment.
 *  2. DWELL is synthesised from page-enter timestamps (the app emits no
 *     discrete "dwell" event; dwell is a primary signal for the estimator).
 *  3. FIELD events are aggregated to one field_edit per (step, field) to avoid
 *     per-character flooding biasing the belief toward "ready".
 *  4. EDIT_QUALITY (clean/hesitant/corrected) is NOT emitted by the app, so it
 *     defaults to "clean". Peter's overwhelm therefore rides on dwell + back,
 *     not on hesitant edits, until the sim emits edit_quality. (See INTEGRATION.md.)
 */

import { CoachEngine } from "./coach.js";

// 1. Step map — JS funnel step (int) -> coach step name. Single source of truth.
//    Default: online-journey-faithful (step 6 is the last input before result,
//    treated as the final-price confrontation). Position map alternative in docs.
export const STEP_NAME = {
  0: "coverage",
  1: "whom",
  2: "personal",
  3: "tariff",
  4: "addons",
  5: "person",
  6: "finalprice",
  7: "history",
  8: "closing",
};

// Web hover targets -> coach targets the likelihood matrix understands.
const HOVER_TARGET = {
  cancel_button: "cancel_button",
  tarif_card_optplus: "optplus_row",
  advisory_badge_optplus: "optplus_row",
  tarif_card_premium: "premium_row",
  glossary_term: "glossary_term",
  phone_icon: "phone_icon",
};

const tMs = (iso) => { const n = Date.parse(iso); return Number.isNaN(n) ? null : n; };

/**
 * Translate a session snapshot's `events` array into an ordered list of §1
 * signal events. Pure: no engine, no side effects.
 */
export function sessionToSignals(snapshot) {
  const events = snapshot?.events ?? [];
  const sessionId = snapshot?.sessionId ?? null;
  const start = snapshot?.startedAt ? tMs(snapshot.startedAt) : (events[0] ? tMs(events[0].t) : 0);
  const endMs = snapshot?.snapshotAt ? tMs(snapshot.snapshotAt) : (events.length ? tMs(events[events.length - 1].t) : null);

  // PASS 1: precompute each page_enter's dwell = time until the next page
  // boundary (next page_enter / abandon / complete / session end).
  const dwellAt = new Map();             // event index -> dwell_ms
  let lastEnterIdx = null, lastEnterMs = null;
  const closeDwell = (boundaryMs) => {
    if (lastEnterIdx != null && lastEnterMs != null && boundaryMs != null) {
      const d = boundaryMs - lastEnterMs;
      if (d > 0) dwellAt.set(lastEnterIdx, d);
    }
    lastEnterIdx = null; lastEnterMs = null;
  };
  events.forEach((e, i) => {
    const et = tMs(e.t);
    if (e.type === "page_enter") { closeDwell(et); lastEnterIdx = i; lastEnterMs = et; }
    else if (e.type === "abandon" || e.type === "funnel_complete") closeDwell(et);
  });
  closeDwell(endMs);

  // PASS 2: emit §1 signals. On page_enter: enter, then its dwell (you dwell,
  // then act) so in-page hover/back land after — and dominate at exit.
  const out = [];
  const historyNames = [];
  const seenField = new Set();           // dedupe field_edit per `${step}:${key}`

  const push = (step, event_type, extra = {}) => {
    const name = STEP_NAME[step];
    if (!name) return;
    const t = extra._t; delete extra._t;
    out.push({ session_id: sessionId, t_ms: t != null ? t - (start ?? 0) : null, step: name, event_type, history: historyNames.slice(), ...extra });
  };

  events.forEach((e, i) => {
    const et = tMs(e.t);
    switch (e.type) {
      case "page_enter": {
        const name = STEP_NAME[e.step];
        if (name && historyNames[historyNames.length - 1] !== name) historyNames.push(name);
        push(e.step, "enter", { _t: et });
        if (dwellAt.has(i)) push(e.step, "dwell", { dwell_ms: dwellAt.get(i), _t: et });
        break;
      }
      case "field": {
        const key = `${e.step}:${e.key}`;
        if (seenField.has(key)) break;                   // aggregate per field
        seenField.add(key);
        push(e.step, "field_edit", { target: e.key, value: e.value ?? null, edit_quality: e.editQuality ?? e.edit_quality ?? "clean", _t: et });
        break;
      }
      case "button": {
        if (e.key === "back") { push(e.step, "back", { nav_vector: -1, _t: et }); break; }
        if (e.key === "next") break;                      // progression captured by page_enter
        if (e.key.startsWith("tarif_select_")) { push(e.step, "select", { value: e.key.slice("tarif_select_".length), _t: et }); break; }
        if (e.key.startsWith("addon_toggle_")) { push(e.step, "toggle", { value: e.key.slice("addon_toggle_".length), _t: et }); break; }
        if (e.key.startsWith("coverage_toggle_")) { push(e.step, "select", { value: e.key.slice("coverage_toggle_".length), _t: et }); break; }
        if (e.key.startsWith("insured_person_")) { push(e.step, "select", { value: e.key.slice("insured_person_".length), _t: et }); break; }
        break;
      }
      case "hover": {
        const target = HOVER_TARGET[e.target];
        if (!target) break;                              // unmapped hover -> no signal
        push(e.step, "hover", { target, _t: et });
        break;
      }
      case "abandon":
        push(e.step, "exit", { _t: et });
        break;
      default:
        break;
    }
  });
  return out;
}

/**
 * Run the coach over a whole session. Returns the action timeline plus the
 * final action — the faithful, per-event integration.
 */
export function runCoachOnSession(snapshot, { alpha = 0.1, floor = 0.1 } = {}) {
  const signals = sessionToSignals(snapshot);
  const eng = new CoachEngine(alpha, floor);
  const timeline = [];
  for (const sig of signals) {
    const action = eng.process(sig);
    timeline.push({ step: sig.step, event_type: sig.event_type, top: eng.est.top, belief: eng.est.asDict(), action });
  }
  const fired = timeline.filter((t) => ["inline", "prompted", "active"].includes(t.action.action_tier));
  const coachingFires = fired.filter((t) => !t.action.scope_exit);
  return {
    sessionId: snapshot?.sessionId ?? null,
    timeline,
    segLean: eng._inferSegLean(),
    routedOutOfScope: eng.outOfScope,           // track: a valid exit, NOT a conversion
    finalAction: timeline.length ? timeline[timeline.length - 1].action : null,
    firstFire: coachingFires.length ? coachingFires[0] : null,
    fireCount: coachingFires.length,            // in-scope coaching interventions only
  };
}

// --- §2 action -> web intercept (mirrors coachState.createCoachIntercept) ----
// Replace this with: import { createCoachIntercept } from "./coachState.js"
// once wired into the app; the output shape is identical.
const euro = (n) => (typeof n === "number" ? `${n.toFixed(2).replace(".", ",")} €` : null);

function actionToIntercept(action, { premium } = {}) {
  if (!action || action.action_tier === "silent" || action.action_tier === "ambient") return null;
  return {
    type: action.channel,                          // chat | handoff | save_progress | tooltip | inline
    message: action.message,
    highlightAddon: null,                          // real policy does not highlight addons (stub did)
    priceReframe: action.channel === "save_progress" && premium != null
      ? `Monatliche Prämie aktuell: ${euro(premium)} — transparent ohne versteckte Kosten.`
      : null,
    appliedAt: new Date().toISOString(),
    source: "coach",
  };
}

/**
 * Drop-in compatibility shim for runCoachStub(). Same signature, same return
 * shape { intercept, reason, pageModifications }. Prefer the per-event path
 * (runCoachOnSession) where a full telemetry snapshot is available — this shim
 * is for the existing single-call site, and is only as rich as `snapshot`.
 */
export function runCoach({ snapshot, premium }) {
  if (!snapshot) {
    return { intercept: null, reason: "no_snapshot: coach needs the telemetry stream (see INTEGRATION.md)", pageModifications: null };
  }
  const res = runCoachOnSession(snapshot);
  const action = res.finalAction;
  const intercept = actionToIntercept(action, { premium });
  return {
    intercept,
    reason: action ? action.reason : "no_action",
    pageModifications: intercept
      ? { bannerMessage: intercept.message, highlightAddon: intercept.highlightAddon, priceReframe: intercept.priceReframe, type: intercept.type }
      : null,
  };
}

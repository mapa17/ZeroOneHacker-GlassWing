/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ CANONICAL COACH — this is the file to wire in. Do NOT edit coachStub.js.  │
 * │ Lives in the web app at: src/agent/coach.js                                │
 * │ Generated from the Python lane (glasswing/coach/*.py) — keep them in sync. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * coach.js — Glass Wing Conversion Coach, ported 1:1 from the Python lane.
 *
 * Source of truth (do not diverge without changing both):
 *   coach/estimator.py    -> BayesianCoachEstimator, STATES
 *   coach/likelihood.py   -> LIKELIHOOD, STEP_BASELINE_MS, eventToLikelihood
 *   coach/policy.py       -> SEGMENT_PRIOR, decide, supportTone
 *   coach/coach_engine.py -> CoachEngine, validateSignal, validateAction
 *
 * THE WALL: stat-blind. Consumes §1 signal events (behaviour only). Never reads
 * a segment/state label. Identity is derived from the belief trajectory.
 * No LLM, no network — deterministic and reproducible, same as the Python coach.
 *
 * Signal events MUST already be in §1 shape (see interfaces.md). Use the
 * adapter (coachAdapter.js) to turn raw web telemetry into §1 events.
 */

// ===== estimator.py =========================================================

import contracts from "../../../contracts/contracts.json" with { type: "json" };

export const STATES = contracts.states;
const N = STATES.length;
const UNIFORM = new Array(N).fill(1 / N);

const argmax = (a) => a.reduce((bi, v, i) => (v > a[bi] ? i : bi), 0);
const round4 = (x) => Math.round(x * 1e4) / 1e4;

export class BayesianCoachEstimator {
  constructor(alpha = 0.1, floor = 0.1) {
    this.alpha = alpha;        // decay-to-uniform weight
    this.floor = floor;        // likelihood floor (anti-collapse)
    this.belief = new Array(N).fill(0.2);
  }

  /** One Bayesian update. likelihood = P(signal|state), length-5. */
  update(likelihood) {
    const clamped = likelihood.map((v) => Math.min(1.0, Math.max(this.floor, v)));
    const raw = this.belief.map((b, i) => b * clamped[i]);
    const s = raw.reduce((acc, v) => acc + v, 0);
    const normalized = s <= 0 ? UNIFORM.slice() : raw.map((v) => v / s);
    // entropy decay: keep estimate responsive to mid-session state change
    this.belief = normalized.map((v, i) => (1 - this.alpha) * v + this.alpha * UNIFORM[i]);
    return this.asDict();
  }

  asDict() {
    const out = {};
    STATES.forEach((st, i) => { out[st] = round4(this.belief[i]); });
    return out;
  }

  get top() { return STATES[argmax(this.belief)]; }

  /** Peakedness: 0 = uniform, 1 = certain. Normalised gap from uniform (0.2). */
  get confidence() { return (Math.max(...this.belief) - 0.2) / 0.8; }

  reset() { this.belief = UNIFORM.slice(); }
}

// ===== likelihood.py ========================================================
// State order: [orienting, evaluating, overwhelmed, ready, abandoning]

export const LIKELIHOOD = contracts.likelihood;
export const STEP_BASELINE_MS = contracts.step_baseline_ms;

const NOOP = new Array(N).fill(1);

function dwellKey(dwellMs, step) {
  const ratio = dwellMs / (STEP_BASELINE_MS[step] ?? 8000);
  if (ratio < 0.5) return "dwell_fast";
  if (ratio < 1.5) return "dwell_normal";
  if (ratio < 4.0) return "dwell_slow";
  return "dwell_stalled";
}

function baseLikelihood(event) {
  const et = event.event_type;
  if (et === "dwell") return LIKELIHOOD[dwellKey(event.dwell_ms ?? 0, event.step ?? "")];
  if (et === "hover") {
    const tgt = event.target;
    if (tgt === "cancel_button") return LIKELIHOOD.hover_cancel;
    if (tgt === "optplus_row" || tgt === "premium_row") return LIKELIHOOD.hover_advisory;
    if (tgt === "glossary_term") return LIKELIHOOD.hover_glossary;
    if (tgt === "phone_icon") return LIKELIHOOD.hover_phone;
    return NOOP;
  }
  if (et === "back") return LIKELIHOOD.back_nav;
  if (et === "toggle") return LIKELIHOOD.toggle_tariff;
  if (et === "select") return LIKELIHOOD.select;
  if (et === "tab_blur") return LIKELIHOOD.tab_blur;
  if (et === "field_edit") {
    const q = event.edit_quality ?? "clean";
    return LIKELIHOOD[`edit_${q}`] ?? LIKELIHOOD.edit_clean;
  }
  return NOOP;
}

/** Map one §1 signal event to a likelihood vector. Never returns zeros. */
export function eventToLikelihood(event) {
  let vec = baseLikelihood(event);
  // context boost: abandon signals at the final-price step carry extra weight
  if (event.step === "finalprice" && (event.event_type === "hover" || event.event_type === "back")) {
    if (event.event_type === "back" || event.target === "cancel_button") {
      vec = vec.slice();
      vec[4] = Math.min(1.0, vec[4] * 1.3);  // lift P(abandoning)
      vec[1] *= 0.7;                          // damp P(evaluating)
    }
  }
  return vec;
}

// ===== policy.py ============================================================

export const SEGMENT_PRIOR = {
  S1: contracts.segment_priors.S1,
  S2: contracts.segment_priors.S2,
  S3: contracts.segment_priors.S3,
  __null: contracts.segment_priors.None
};
const prior = (seg) => SEGMENT_PRIOR[seg ?? "__null"] ?? SEGMENT_PRIOR.__null;

export const CONF_GATE = contracts.conf_gate;
export const LOW_CONF_EXIT = contracts.low_conf_exit;

function supportTone(state, p) {
  if (state === "ready") return "step_back";
  if (state === "orienting" || state === "evaluating") return "low_pressure";
  if (state === "overwhelmed") return p.nps < 0 ? "warm_concrete" : "reassure";
  if (state === "abandoning") return p.advisor_ok ? "warm_exit" : "cold_factual";
  return "neutral";
}

/**
 * Return a §2 action object. segLean is trajectory-inferred S1/S2/S3 or null.
 *
 * TRACK ALIGNMENT (Track_AI_Guided_Conversion_Flow §3/§4): conversion = ONLINE
 * completion only. Advisor handoff is NOT a coaching goal and is reserved for
 * out-of-scope routing (handled by the engine, not here). Every in-scope action
 * below aims to keep the user completing online.
 */
export function decide(estimator, step, segLean, priceGap = false) {
  const state = estimator.top;
  const conf = estimator.confidence;
  const p = prior(segLean);
  const belief = estimator.asDict();
  const tone = supportTone(state, p);
  const act = (tier, channel, message, reason) =>
    ({ action_tier: tier, channel, message, reason, belief, support_tone: tone });

  // silence gate — silence is the default, over-firing is the failure mode
  if (conf < CONF_GATE) {
    return act("silent", "none", null, `conf=${conf.toFixed(2)} below gate ${CONF_GATE}; staying dark`);
  }

  // not-at-risk -> stay out of the way / passive cue only
  if (state === "ready") {
    return act("silent", "none", null, `state=ready conf=${conf.toFixed(2)}; clear friction only, no interruption`);
  }
  if (state === "orienting" || state === "evaluating") {
    return act("ambient", "tooltip", "[ambient term hints available]",
      `state=${state} conf=${conf.toFixed(2)}; passive cue only`);
  }

  // overwhelmed (Peter-like) -> SIMPLIFY to keep them on the online path.
  if (state === "overwhelmed") {
    return act("prompted", "chat",
      "This can be a lot — want me to recommend the right option in one line?",
      `state=overwhelmed conf=${conf.toFixed(2)}; simplify to keep online (NPS=${p.nps} -> actionable, not brand-warmth)`);
  }

  // abandoning -> the one earned interruption, aimed at finishing ONLINE
  if (state === "abandoning") {
    if (segLean === "S2") {
      return act("active", "save_progress",
        "Your final price reflects your health profile. Save your progress and finish whenever — no call needed.",
        `state=abandoning S2-lean conf=${conf.toFixed(2)}; price_gap=${priceGap}; save_progress (online retention, advisor rejected by segment)`);
    }
    return act("active", "chat",
      "Looks like something's holding you up — can I help you finish this here?",
      `state=abandoning conf=${conf.toFixed(2)}; earned interruption; advisor_ok=${p.advisor_ok}`);
  }

  return act("silent", "none", null, `no rule matched state=${state}`);
}

// ===== coach_engine.py ======================================================

const VALID_STEPS = new Set(Object.keys(contracts.step_baseline_ms));
const VALID_EVENTS = new Set([
  "enter", "dwell", "hover", "toggle", "back", "select", "field_edit", "tab_blur", "chat_msg", "exit",
]);
const VALID_EDIT_QUALITY = new Set(["clean", "hesitant", "corrected", null, undefined]);
const VALID_TIERS = new Set(["silent", "ambient", "inline", "prompted", "active"]);
const VALID_CHANNELS = new Set(["none", "tooltip", "inline", "chat", "handoff", "save_progress"]);
const VALID_TONES = new Set(["step_back", "low_pressure", "warm_concrete", "reassure", "cold_factual", "warm_exit", "neutral"]);

const OUT_OF_SCOPE_VALUES = new Set(contracts.out_of_scope_values);

function isOutOfScopeEvent(ev) {
  const v = String(ev.value ?? "").toLowerCase();
  if (ev.event_type === "select" && OUT_OF_SCOPE_VALUES.has(v)) return true;
  if (ev.event_type === "toggle" && v === "krankenhaus") return true;
  // prior private insurance branch -> advisor (field carries its key in `target`)
  if (ev.event_type === "field_edit" && ev.target === "privatVersichert7" && v === "ja") return true;
  return false;
}

export function validateSignal(ev) {
  const issues = [];
  if (ev === null || typeof ev !== "object") return { ok: false, issues: ["event is not an object"] };
  if (!VALID_EVENTS.has(ev.event_type)) issues.push(`unknown event_type=${JSON.stringify(ev.event_type)}`);
  if (!VALID_STEPS.has(ev.step)) issues.push(`unknown step=${JSON.stringify(ev.step)}`);
  if ("dwell_ms" in ev && typeof ev.dwell_ms !== "number") issues.push("dwell_ms not numeric");
  if ("nav_vector" in ev && ![-1, 0, 1].includes(ev.nav_vector)) issues.push(`nav_vector out of range: ${JSON.stringify(ev.nav_vector)}`);
  if (ev.event_type === "field_edit" && !VALID_EDIT_QUALITY.has(ev.edit_quality)) issues.push(`bad edit_quality=${JSON.stringify(ev.edit_quality)}`);
  // THE WALL — a label must never arrive in the stream
  for (const forbidden of ["persona", "segment", "label", "true_state"]) {
    if (forbidden in ev) issues.push(`WALL VIOLATION: '${forbidden}' present in signal`);
  }
  return { ok: issues.length === 0, issues };
}

function safeAction(beliefDict, reason) {
  return { action_tier: "silent", channel: "none", message: null, reason, belief: beliefDict, support_tone: "neutral" };
}

export function validateAction(action) {
  if (!VALID_TIERS.has(action.action_tier)) {
    action.action_tier = "silent";
    action.channel = "none";
    action.reason = `[coerced] invalid tier -> silent | ${action.reason ?? ""}`;
  }
  if (!VALID_CHANNELS.has(action.channel)) action.channel = "none";
  if (!action.reason) action.reason = "[no reason supplied]";
  if (!("belief" in action)) action.belief = Object.fromEntries(STATES.map((s) => [s, 0.2]));
  if (!VALID_TONES.has(action.support_tone)) action.support_tone = "neutral";
  return action;
}

/** One engine per session. Feed it §1 events; get back validated §2 actions. */
export class CoachEngine {
  constructor(alpha = 0.1, floor = 0.1) {
    this.est = new BayesianCoachEstimator(alpha, floor);
    this.history = [];          // [{top, step}] — for trajectory seg-lean
    this.sessionId = null;
    this.outOfScope = false;    // latched once an out-of-scope path is chosen
  }

  process(ev) {
    try {
      this.sessionId = this.sessionId ?? (ev && typeof ev === "object" ? ev.session_id ?? null : null);
      const v = validateSignal(ev);
      if (!v.ok) {
        return validateAction(safeAction(this.est.asDict(), "INVALID SIGNAL -> no-op | " + v.issues.join("; ")));
      }
      // keep observing behaviour either way (THE WALL: belief from behaviour only)
      this.est.update(eventToLikelihood(ev));
      this.history.push({ top: this.est.top, step: ev.step });

      // scope boundary (track §4): route out-of-scope users to an advisor ONCE,
      // then stay silent. This is a clean exit, NOT a coaching win or a conversion.
      if (this.outOfScope) {
        return validateAction(safeAction(this.est.asDict(), "out-of-scope: already routed to advisor; coach silent"));
      }
      if (isOutOfScopeEvent(ev)) {
        this.outOfScope = true;
        return validateAction({
          action_tier: "active", channel: "handoff", scope_exit: true,
          message: "This option needs a quick word with an advisor — I'll connect you, and everything you've entered is saved.",
          reason: `scope_exit: out-of-scope selection at ${ev.step} (value=${JSON.stringify(ev.value)}); route to advisor, no coaching (not a conversion)`,
          belief: this.est.asDict(), support_tone: "neutral",
        });
      }

      // in-scope: coach toward online completion
      const seg = this._inferSegLean();
      const priceGap = ev.step === "finalprice";
      return validateAction(decide(this.est, ev.step, seg, priceGap));
    } catch (e) {
      return validateAction(safeAction(this.est.asDict(), `ENGINE ERROR -> safe no-op | ${e?.name}: ${e?.message}`));
    }
  }

  _inferSegLean() {
    // DEVIATION FROM run_demo.py's placeholder: reason over per-STEP top-states,
    // not per-event. The original `states[:3]` assumed ~1 event per step (the
    // fake_signals granularity); the real telemetry stream emits many events per
    // step, so "first 3 events" != "first 3 steps". This per-step version is
    // granularity-invariant. SYNC THIS BACK INTO coach_engine.py._infer_seg_lean.
    const stepsInOrder = [];
    const topsByStep = new Map();
    for (const h of this.history) {
      if (!stepsInOrder.includes(h.step)) stepsInOrder.push(h.step);
      if (!topsByStep.has(h.step)) topsByStep.set(h.step, new Set());
      topsByStep.get(h.step).add(h.top);
    }
    const first3 = stepsInOrder.slice(0, 3);
    if (first3.some((s) => topsByStep.get(s)?.has("overwhelmed"))) return "S3";
    const lastTop = this.history.length ? this.history[this.history.length - 1].top : null;
    const lastStep = stepsInOrder[stepsInOrder.length - 1];
    if (lastTop === "abandoning" && lastStep === "finalprice") return "S2";
    if (this.history.some((h) => h.top === "abandoning") && stepsInOrder.includes("tariff")) return "S1";
    return null;
  }
}

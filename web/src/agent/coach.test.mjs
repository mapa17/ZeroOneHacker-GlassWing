import test from "node:test";
import assert from "node:assert";
import { BayesianCoachEstimator, eventToLikelihood, decide, CoachEngine, STATES } from "./coach.js";

// --- estimator invariants ---------------------------------------------------
test("estimator invariants", () => {
  const est = new BayesianCoachEstimator();
  est.update(eventToLikelihood({ event_type: "select", step: "coverage" }));
  const sum = est.belief.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
  assert.ok(est.confidence >= 0 && est.confidence <= 1, `conf=${est.confidence}`);
  assert.strictEqual(est.top, "ready", `top=${est.top}`);
});

// --- Franz (S2): late abandon at finalprice -> save_progress, NOT handoff ---
test("Franz (S2) behavior", () => {
  const eng = new CoachEngine();
  const evs = [
    { event_type: "enter", step: "coverage" },
    { event_type: "select", step: "coverage" },
    { event_type: "dwell", step: "tariff", dwell_ms: 12000 },
    { event_type: "select", step: "tariff", value: "optimal" },
    { event_type: "dwell", step: "finalprice", dwell_ms: 30000 },
    { event_type: "hover", step: "finalprice", target: "cancel_button" },
    { event_type: "back", step: "finalprice", nav_vector: -1 },
    { event_type: "back", step: "finalprice", nav_vector: -1 },
  ];
  let last;
  for (const e of evs) last = eng.process(e);
  assert.strictEqual(eng.est.top, "abandoning", `top=${eng.est.top}`);
  assert.strictEqual(eng._inferSegLean(), "S2", `seg=${eng._inferSegLean()}`);
  assert.ok(last.action_tier === "active" && last.channel === "save_progress", `${last.action_tier}/${last.channel}`);
  assert.strictEqual(last.support_tone, "cold_factual", last.support_tone);
});

// --- Peter (S3): early overwhelm -> SIMPLIFY (keep online), never handoff -----
test("Peter (S3) behavior", () => {
  const eng = new CoachEngine();
  const evs = [
    { event_type: "enter", step: "coverage" },
    { event_type: "dwell", step: "personal", dwell_ms: 60000 },                 // stalled
    { event_type: "field_edit", step: "personal", edit_quality: "hesitant" },
    { event_type: "field_edit", step: "personal", edit_quality: "corrected" },
    { event_type: "dwell", step: "personal", dwell_ms: 70000 },
  ];
  let last;
  for (const e of evs) last = eng.process(e);
  assert.strictEqual(eng.est.top, "overwhelmed", `top=${eng.est.top}`);
  assert.strictEqual(eng._inferSegLean(), "S3", `seg=${eng._inferSegLean()}`);
  assert.ok(last.channel === "chat" && last.channel !== "handoff", `${last.action_tier}/${last.channel}`);
  assert.strictEqual(last.support_tone, "warm_concrete", last.support_tone);
});

// --- scope routing: out-of-scope tariff -> clean advisor route, then silent ---
test("scope routing", () => {
  const eng = new CoachEngine();
  eng.process({ event_type: "select", step: "coverage", value: "arzt" });
  const r1 = eng.process({ event_type: "select", step: "tariff", value: "premium" });
  assert.ok(r1.channel === "handoff" && r1.scope_exit === true, `${r1.channel} scope_exit=${r1.scope_exit}`);
  assert.ok(/not a conversion/.test(r1.reason), r1.reason);
  const r2 = eng.process({ event_type: "back", step: "tariff", nav_vector: -1 });
  assert.ok(r2.action_tier === "silent" && eng.outOfScope, `${r2.action_tier}`);
});

// --- in-scope coaching must NEVER use the handoff channel --------------------
test("no handoff as coaching goal", () => {
  const eng = new CoachEngine();
  const evs = [
    { event_type: "dwell", step: "finalprice", dwell_ms: 40000 },
    { event_type: "hover", step: "finalprice", target: "cancel_button" },
    { event_type: "back", step: "finalprice", nav_vector: -1 },
    { event_type: "back", step: "finalprice", nav_vector: -1 },
  ];
  let everHandoff = false;
  for (const e of evs) { const a = eng.process(e); if (a.channel === "handoff") everHandoff = true; }
  assert.ok(!everHandoff, "handoff fired as coaching");
});

// --- silence: a clean fast journey should NOT fire ---------------------------
test("silence / not-at-risk", () => {
  const eng = new CoachEngine();
  const evs = [
    { event_type: "select", step: "coverage" },
    { event_type: "dwell", step: "tariff", dwell_ms: 6000 },     // fast
    { event_type: "select", step: "tariff", value: "optimal" },
    { event_type: "select", step: "person" },
  ];
  let fired = 0, last;
  for (const e of evs) { last = eng.process(e); if (["prompted", "active"].includes(last.action_tier)) fired++; }
  assert.strictEqual(fired, 0, `fired=${fired}, top=${eng.est.top}`);
});

// --- WALL: a labelled event must degrade to safe no-op ----------------------
test("the wall constraint", () => {
  const eng = new CoachEngine();
  const a = eng.process({ event_type: "hover", step: "tariff", target: "cancel_button", segment: "S2" });
  assert.ok(a.action_tier === "silent" && a.reason.includes("WALL VIOLATION"), a.reason);
});

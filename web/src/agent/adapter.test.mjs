import test from "node:test";
import assert from "node:assert";
import { sessionToSignals, runCoachOnSession, runCoach } from "./coachAdapter.js";

// builder: monotonic clock, emits the same event shape personaSimulator/useTracking use
function mkSession(id) {
  let t = Date.parse("2026-05-30T09:00:00.000Z");
  const events = [];
  const startedAt = new Date(t).toISOString();
  const api = {
    wait(ms) { t += ms; return api; },
    enter(step) { events.push({ t: new Date(t).toISOString(), type: "page_enter", step }); return api; },
    field(step, key, value, editQuality) { events.push({ t: new Date(t).toISOString(), type: "field", key, step, value, editQuality }); return api; },
    button(step, key) { events.push({ t: new Date(t).toISOString(), type: "button", key, step }); return api; },
    hover(step, target) { events.push({ t: new Date(t).toISOString(), type: "hover", target, step, dwellMs: 3000 }); return api; },
    abandon(step) { events.push({ t: new Date(t).toISOString(), type: "abandon", step, page: "x" }); return api; },
    complete() { events.push({ t: new Date(t).toISOString(), type: "funnel_complete", step: 8 }); return api; },
    build() { return { sessionId: id, startedAt, snapshotAt: new Date(t).toISOString(), events }; },
  };
  return api;
}

// --- adapter mapping sanity -------------------------------------------------
test("adapter mapping sanity", () => {
  const s = mkSession("map").enter(0).button(0, "coverage_toggle_arzt").wait(4000).enter(1).build();
  const sigs = sessionToSignals(s);
  assert.ok(sigs[0].event_type === "enter" && sigs[0].step === "coverage");
  assert.ok(sigs.some((x) => x.event_type === "dwell" && x.step === "coverage" && x.dwell_ms === 4000));
  assert.ok(sigs.some((x) => x.event_type === "select" && x.step === "coverage"));
  assert.ok(sigs.every((x) => !("segment" in x) && !("persona" in x)));
});

// --- field flooding guard ---------------------------------------------------
test("field aggregation", () => {
  const s = mkSession("ff").enter(5);
  for (let i = 1; i <= 12; i++) s.field(5, "email", "a".repeat(i)); // 12 per-char field events
  const sigs = sessionToSignals(s.wait(8000).complete().build());
  const fieldEdits = sigs.filter((x) => x.event_type === "field_edit" && x.step === "person");
  assert.strictEqual(fieldEdits.length, 1, `got ${fieldEdits.length}`);
});

// --- Franz (S2): online, late abandon at finalprice -------------------------
test("Franz (S2) end-to-end", () => {
  const s = mkSession("franz")
    .enter(0).button(0, "coverage_toggle_arzt").wait(4000)
    .enter(1).button(1, "insured_person_myself").wait(2500)
    .enter(2).field(2, "geburtsdatum", "12.03.1984").wait(10000)
    .enter(3).button(3, "tarif_select_optimal").wait(12000)
    .enter(5).field(5, "vorname", "Franz").field(5, "gewicht", "95").wait(18000)
    .enter(6).wait(45000).hover(6, "cancel_button").wait(1500).button(6, "back").wait(1000).abandon(6)
    .build();
  const r = runCoachOnSession(s);
  assert.strictEqual(r.segLean, "S2", `seg=${r.segLean}`);
  assert.strictEqual(r.timeline.at(-1).top, "abandoning", `top=${r.timeline.at(-1).top}`);
  assert.ok(r.finalAction.action_tier === "active" && r.finalAction.channel === "save_progress", `${r.finalAction.action_tier}/${r.finalAction.channel}`);
  const di = runCoach({ snapshot: s, premium: 75.91 });
  assert.strictEqual(di.intercept?.type, "save_progress", di.intercept?.type);
  assert.ok(typeof di.intercept?.priceReframe === "string" && di.intercept.priceReframe.includes("75,91"), di.intercept?.priceReframe);
});

// --- Peter (S3): early overwhelm, drops before price ------------------------
test("Peter (S3) end-to-end", () => {
  const s = mkSession("peter")
    .enter(0).button(0, "coverage_toggle_arzt").wait(6000)
    .enter(1).button(1, "insured_person_myself").wait(3000)
    .enter(2).field(2, "geburtsdatum", "01.01.1970", "hesitant").wait(70000)   // stalled
    .enter(2).wait(65000)                                          // re-enter, stalled again
    .abandon(2)
    .build();
  const r = runCoachOnSession(s);
  assert.strictEqual(r.segLean, "S3", `seg=${r.segLean}`);
  assert.ok(r.timeline.some((x) => x.top === "overwhelmed"), "never overwhelmed");
  assert.ok(r.fireCount > 0 && ["inline", "prompted"].includes(r.firstFire.action.action_tier) && r.firstFire.action.channel === "chat", `tier=${r.firstFire?.action.action_tier} ch=${r.firstFire?.action.channel}`);
  assert.strictEqual(r.routedOutOfScope, false, `routed=${r.routedOutOfScope}`);
  assert.ok(r.timeline.every((x) => x.action.channel !== "handoff"), "handoff fired");
});

// --- scope: out-of-scope tariff selection routes to advisor, not coached -----
test("scope routing end-to-end", () => {
  const s = mkSession("oos")
    .enter(0).button(0, "coverage_toggle_arzt").wait(4000)
    .enter(1).button(1, "insured_person_myself").wait(2500)
    .enter(2).field(2, "geburtsdatum", "01.01.1980").wait(9000)
    .enter(3).button(3, "tarif_select_premium").wait(5000)        // out of scope
    .enter(5).field(5, "vorname", "X").wait(8000).complete()
    .build();
  const r = runCoachOnSession(s);
  assert.strictEqual(r.routedOutOfScope, true, `routed=${r.routedOutOfScope}`);
  const route = r.timeline.find((x) => x.action.scope_exit);
  assert.ok(!!route && route.action.channel === "handoff", "no scope handoff");
  assert.strictEqual(r.fireCount, 0, `fires=${r.fireCount}`);
});

// --- Judith (S1): quiet disengage near tariff -> not forced -----------------
test("Judith (S1) end-to-end", () => {
  const s = mkSession("judith")
    .enter(0).button(0, "coverage_toggle_arzt").wait(4000)
    .enter(1).button(1, "insured_person_myself").wait(2500)
    .enter(2).field(2, "geburtsdatum", "07.07.1968").wait(9000)
    .enter(3).hover(3, "advisory_badge_optplus").wait(3000).hover(3, "tarif_card_premium").wait(3000).button(3, "back").wait(20000).abandon(3)
    .build();
  const r = runCoachOnSession(s);
  assert.ok(["S1", null].includes(r.segLean), `seg=${r.segLean}`);
  assert.ok(r.fireCount <= 1, `fires=${r.fireCount}`);
});

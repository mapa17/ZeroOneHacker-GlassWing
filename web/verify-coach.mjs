// verify-coach.mjs — run from the repo root:  node verify-coach.mjs
// Builds a real snapshot from personaSimulator and checks the coach end-to-end.

import { personaById } from "./src/data/personas.js";
import { simulateSession } from "./src/logic/personaSimulator.js";
import { sessionToSignals, runCoachOnSession } from "./src/agent/coachAdapter.js";

console.log("persona  events  signals  segLean  fires  routedOOS  finalAction");
console.log("-------  ------  -------  -------  -----  ---------  -----------");

for (const id of ["franz", "peter", "judith"]) {
  try {
    const persona = personaById(id);
    if (!persona) { console.log(`${id}: NOT FOUND in PERSONAS`); continue; }

    const snap = simulateSession(persona, 1);            // seed 1; deterministic
    const events = snap?.events?.length ?? 0;
    const signals = sessionToSignals(snap).length;
    const r = runCoachOnSession(snap);
    const fa = r.finalAction ? `${r.finalAction.action_tier}/${r.finalAction.channel}` : "—";

    console.log(
      `${id.padEnd(7)}  ${String(events).padEnd(6)}  ${String(signals).padEnd(7)}  ` +
      `${String(r.segLean).padEnd(7)}  ${String(r.fireCount).padEnd(5)}  ${String(r.routedOutOfScope).padEnd(9)}  ${fa}`
    );

    // show the first real intervention, if any
    const fire = r.timeline.find((t) => ["inline", "prompted", "active"].includes(t.action.action_tier) && !t.action.scope_exit);
    if (fire) console.log(`         ↳ first fire @${fire.step}: ${fire.action.action_tier}/${fire.action.channel} — "${(fire.action.message || "").slice(0, 60)}"`);
  } catch (e) {
    console.log(`${id}: ERROR — ${e.message}`);
  }
}

console.log("\nIf signals=0 -> the snapshot has no events (coach will be silent).");
console.log("If signals>0 but fires=0 -> signals too weak to cross the confidence gate.");

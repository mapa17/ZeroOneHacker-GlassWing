import { PAGE_NAMES } from "../logs/constants.js";
import { analyzeSession } from "../logic/personaClassifier.js";

/** Build a minimal session snapshot from interactive turn history for classifier/coach. */
export function buildSyntheticSnap({ sessionId, engine, turns, abandoned, dropStep }) {
  const pages = {};
  const backPresses = [];
  let prevTs = null;

  for (const t of turns) {
    if (t.funnelStep == null) continue;
    const step = t.funnelStep;
    if (!pages[step]) pages[step] = { name: PAGE_NAMES[step], enters: 1, totalTimeMs: 0 };
    else pages[step].enters += 1;

    if (prevTs && t.timestamp) {
      const dwell = Math.max(500, new Date(t.timestamp) - new Date(prevTs));
      pages[step].totalTimeMs += dwell;
    }
    prevTs = t.timestamp;

    if (t.effect?.actionApplied?.type === "back") {
      backPresses.push({ step, page: PAGE_NAMES[step], timeOnPageMs: 0 });
    }
  }

  const events = [];
  let prevStep = null;
  for (const t of turns) {
    if (t.funnelStep == null) continue;
    const step = t.funnelStep;
    const ts = t.timestamp || new Date().toISOString();
    if (step !== prevStep) {
      events.push({ t: ts, type: "page_enter", step, name: PAGE_NAMES[step] });
      prevStep = step;
    }
    const aa = t.effect?.actionApplied;
    const verb = aa?.action || aa?.appliedMeta?.type;
    if (!aa || !verb) continue;
    if (verb === "back") {
      events.push({ t: ts, type: "button", key: "back", step });
    } else if (verb === "select_tarif" && aa.tarif) {
      events.push({ t: ts, type: "button", key: `tarif_select_${aa.tarif}`, step });
    } else if (verb === "toggle_addons") {
      for (const [k, v] of Object.entries(aa.addons || {})) {
        if (v) events.push({ t: ts, type: "button", key: `addon_toggle_${k}`, step });
      }
    } else if (verb === "select_coverage") {
      if (aa.arzt) events.push({ t: ts, type: "button", key: "coverage_toggle_arzt", step });
      if (aa.krankenhaus) events.push({ t: ts, type: "button", key: "coverage_toggle_krankenhaus", step });
    } else if (verb === "select_insured_person" && aa.insuredPerson) {
      events.push({ t: ts, type: "button", key: `insured_person_${aa.insuredPerson}`, step });
    } else if (verb === "fill_fields") {
      for (const k of Object.keys(aa).filter((key) => !["action", "appliedMeta", "reclassifiedToPause", "note"].includes(key))) {
        events.push({ t: ts, type: "field", key: k, step, value: aa[k] });
      }
    }
  }
  if (abandoned && dropStep != null) {
    events.push({ t: turns.at(-1)?.timestamp || new Date().toISOString(), type: "abandon", step: dropStep, page: PAGE_NAMES[dropStep] });
  }

  const buttons = {};
  const fields = {};
  for (const e of events) {
    if (e.type === "button") {
      buttons[e.key] = (buttons[e.key] || 0) + 1;
    } else if (e.type === "field") {
      fields[e.key] = { value: e.value };
    }
  }

  // Ensure current active tariff selected state is always guaranteed in buttons mapping
  const activeTarif = engine.form.tarif;
  if (activeTarif) {
    buttons[`tarif_select_${activeTarif}`] = buttons[`tarif_select_${activeTarif}`] || 1;
  }

  return {
    sessionId,
    mode: "interactive",
    startedAt: turns[0]?.timestamp || new Date().toISOString(),
    currentStep: abandoned ? dropStep : engine.step,
    currentPage: PAGE_NAMES[abandoned ? dropStep : engine.step],
    completed: engine.completed && !abandoned,
    formChoices: {
      tarif: engine.form.tarif,
      route: engine.getOutcome().route,
      addons: Object.entries(engine.form.addons || {}).filter(([, v]) => v).map(([k]) => k),
    },
    pages,
    buttons,
    fields,
    hovers: [],
    backPresses,
    abandons: abandoned ? [{ step: dropStep, page: PAGE_NAMES[dropStep] }] : [],
    events,
    summary: {
      backPresses: backPresses.length,
      hovers: 0,
      events: events.length,
      fieldsInteracted: Object.keys(fields).length,
      totalButtonClicks: Object.values(buttons).reduce((s, n) => s + n, 0),
    },
  };
}

export function analyzeInteractiveSession(ctx) {
  const snap = buildSyntheticSnap(ctx);
  return { snap, ...analyzeSession(snap) };
}

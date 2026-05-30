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

  const tarif = engine.form.tarif;
  const buttons = {};
  if (tarif) buttons[`tarif_select_${tarif}`] = 1;

  const reachedOutcome = engine.completed && !abandoned; // reached step 8
  const status = reachedOutcome ? engine.terminalStatus : null;

  return {
    sessionId,
    mode: "interactive",
    startedAt: turns[0]?.timestamp || new Date().toISOString(),
    currentStep: abandoned ? dropStep : engine.step,
    currentPage: PAGE_NAMES[abandoned ? dropStep : engine.step],
    reachedOutcome,
    completed: status === "completed",
    advisorForward: status === "advisor_forward",
    formChoices: {
      tarif: engine.form.tarif,
      route: engine.getOutcome().route,
      addons: Object.entries(engine.form.addons || {}).filter(([, v]) => v).map(([k]) => k),
    },
    pages,
    buttons,
    fields: {},
    hovers: [],
    backPresses,
    abandons: abandoned ? [{ step: dropStep, page: PAGE_NAMES[dropStep] }] : [],
    events: [],
    summary: {
      backPresses: backPresses.length,
      hovers: 0,
    },
  };
}

export function analyzeInteractiveSession(ctx) {
  const snap = buildSyntheticSnap(ctx);
  return { snap, ...analyzeSession(snap) };
}

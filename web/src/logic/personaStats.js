// Runs the simulator across all personas and aggregates the results into the
// percentage statistics shown in the Statistics Lab. Everything here is derived
// from the data-grounded simulator + the same classifier used on live sessions,
// so the numbers are an honest test of "can we recover the persona and where do
// they drop off" rather than hand-authored figures.

import { PERSONAS, personaById, FUNNEL_CONTEXT } from "../data/personas.js";
import { runBatch } from "./personaSimulator.js";
import { analyzeSession } from "./personaClassifier.js";

const FUNNEL_STEPS = [0, 1, 2, 3, 4, 5, 6, 8];
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function runSimulation({ runsPerPersona = 50, seed = 1 } = {}) {
  const perPersona = {};
  const confusion = {}; // actualId -> { predictedId|none -> count }
  let totalSessions = 0;
  let totalCorrect = 0;

  PERSONAS.forEach((persona, idx) => {
    const batch = runBatch(persona, runsPerPersona, seed + idx * 104729);
    const predictedCounts = { judith: 0, franz: 0, peter: 0, none: 0 };
    const reachedCounts = {};
    const dropCounts = {};
    FUNNEL_STEPS.forEach((s) => { reachedCounts[s] = 0; dropCounts[s] = 0; });

    let completed = 0;
    let correct = 0;
    let sumHesitation = 0;
    let sumTarifDwell = 0;
    let overwhelmed = 0;
    let advisoryHoverSessions = 0;
    let routeOnline = 0;
    let sumConfidence = 0;

    batch.forEach((snap) => {
      const { signals, classification } = analyzeSession(snap);
      const predicted = classification.match?.id || "none";
      predictedCounts[predicted] += 1;
      if (predicted === persona.id) { correct += 1; sumConfidence += classification.match.confidence; }

      if (snap.completed) completed += 1;
      const dropStep = snap.abandons?.[0]?.step;
      if (dropStep != null && dropCounts[dropStep] != null) dropCounts[dropStep] += 1;
      FUNNEL_STEPS.forEach((s) => { if (snap.pages[s]) reachedCounts[s] += 1; });

      sumHesitation += signals.hesitationScore;
      sumTarifDwell += signals.tarifDwellMs;
      if (signals.overwhelmedTariff) overwhelmed += 1;
      if (signals.advisoryHovers > 0) advisoryHoverSessions += 1;
      if (signals.route === "online") routeOnline += 1;
    });

    const n = batch.length;
    totalSessions += n;
    totalCorrect += correct;
    confusion[persona.id] = predictedCounts;

    const reachedByStep = {};
    const dropByStep = {};
    FUNNEL_STEPS.forEach((s) => { reachedByStep[s] = pct(reachedCounts[s], n); dropByStep[s] = pct(dropCounts[s], n); });

    perPersona[persona.id] = {
      runs: n,
      completionPct: pct(completed, n),
      accuracyPct: pct(correct, n),
      avgConfidence: correct > 0 ? Math.round(sumConfidence / correct) : 0,
      avgHesitation: Math.round(sumHesitation / n),
      avgTarifDwellMs: Math.round(sumTarifDwell / n),
      overwhelmedPct: pct(overwhelmed, n),
      advisoryHoverPct: pct(advisoryHoverSessions, n),
      routeOnlinePct: pct(routeOnline, n),
      reachedByStep,
      dropByStep,
      predictedCounts,
      predictedPct: {
        judith: pct(predictedCounts.judith, n),
        franz: pct(predictedCounts.franz, n),
        peter: pct(predictedCounts.peter, n),
        none: pct(predictedCounts.none, n),
      },
    };
  });

  // Traffic-weighted overall figures (using personas.json online-funnel share).
  let weightedConversion = 0;
  const weightedReached = {};
  FUNNEL_STEPS.forEach((s) => { weightedReached[s] = 0; });
  PERSONAS.forEach((p) => {
    const w = FUNNEL_CONTEXT.trafficShare[p.id] || 0;
    weightedConversion += w * (perPersona[p.id].completionPct / 100);
    FUNNEL_STEPS.forEach((s) => { weightedReached[s] += w * (perPersona[p.id].reachedByStep[s] / 100); });
  });

  const weightedReachedPct = {};
  FUNNEL_STEPS.forEach((s) => { weightedReachedPct[s] = Math.round(weightedReached[s] * 1000) / 10; });

  return {
    perPersona,
    confusion,
    overall: {
      totalSessions,
      accuracyPct: pct(totalCorrect, totalSessions),
      trafficWeightedConversionPct: Math.round(weightedConversion * 1000) / 10,
      baselineConversionPct: FUNNEL_CONTEXT.onlineConversionBaseline * 100,
      weightedReachedPct,
    },
    benchmarks: FUNNEL_CONTEXT,
  };
}

export { personaById };

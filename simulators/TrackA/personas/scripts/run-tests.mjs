#!/usr/bin/env node
// Persona test runner.
//
// Flow:
//   1. Pick a total number of personas (--n).
//   2. Split them across the three segments using the online-funnel traffic
//      share declared in personas/personas.json (shared_context →
//      online_funnel_traffic_share, lines 16–18: S1 30% / S2 50% / S3 20%).
//   3. For each persona, sample a profile and write it to disk immediately
//      (persona_generator schema only — no usage / telemetry logs in session files).
//      Simulation still runs in memory for summary.json + index.csv aggregates.
//
// Writes:
//   test-results/<run>/sessions/profile_<archetype>_<seed>.json   — profile only
//   test-results/<run>/index.csv                    — one row per session
//   test-results/<run>/summary.json                 — aggregate statistics (%)
//
// A fixed seed makes the whole run reproducible.
//
// Usage:
//   node scripts/run-tests.mjs                 # 1000 personas, seed 1
//   node scripts/run-tests.mjs --n 600 --seed 7
//   node scripts/run-tests.mjs --gpt           # + OpenAI enrichment (needs OPENAI_API_KEY in .env)

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PERSONAS, FUNNEL_CONTEXT } from "../src/data/personas.js";
import { simulateSession } from "../src/logic/personaSimulator.js";
import { analyzeSession } from "../src/logic/personaClassifier.js";
import { funnelGateStats, compareToBenchmarks, visitorPlanFromTraffic } from "../src/logic/benchmarkValidation.js";
import { PersonaSampler, makeRng } from "../src/logic/personaProfileGenerator.js";
import { nextTestRunId } from "../src/testRunId.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Raw segmentation data — the single source of truth for both the traffic split
// and the persona-profile sampler.
const PERSONAS_JSON = JSON.parse(readFileSync(join(ROOT, "personas", "personas.json"), "utf8"));
const TRAFFIC_SHARE = PERSONAS_JSON.shared_context?.online_funnel_traffic_share || {};

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const N = parseInt(argVal("--n", "1000"), 10);
const SEED = parseInt(argVal("--seed", "1"), 10);
const USE_GPT = args.includes("--gpt");
const TEST_RESULTS_DIR = join(ROOT, "test-results");
const RUN_ID = argVal("--run", nextTestRunId(TEST_RESULTS_DIR));

const FUNNEL_STEPS = [0, 1, 2, 3, 4, 5, 6, 8];
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

// ---- step 2: split the N personas across segments per personas.json --------
function visitorPlan(total) {
  return visitorPlanFromTraffic(total, PERSONAS, TRAFFIC_SHARE);
}

async function main() {
  const outDir = join(TEST_RESULTS_DIR, RUN_ID);
  const sessDir = join(outDir, "sessions");
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(sessDir, { recursive: true });

  if (USE_GPT) {
    console.warn("  ⚠ --gpt ignored: session files are profile-only (no personaInstance written).\n");
  }

  const plan = visitorPlan(N);

  console.log(`\n▶ UNIQA persona simulation "${RUN_ID}"`);
  console.log(`  step 1 · creating ${N} personas (seed ${SEED}, gpt ${USE_GPT ? "on" : "off"})`);
  console.log(`  step 2 · split by online-funnel traffic share (personas.json):`);
  plan.forEach(({ persona, count, share }) =>
    console.log(`           ${persona.segmentId} · ${persona.name.split(" ")[0].padEnd(7)} ${Math.round(share * 100)}% → ${count}`));
  console.log(`  step 3 · writing profile JSON (no usage logs per file)\n`);

  const sampler = new PersonaSampler(PERSONAS_JSON);
  const sessions = [];
  const csvRows = [
    ["fileId", "groundTruth", "personaName", "age", "predicted", "confidence", "correct", "completed",
     "dropStep", "dropPage", "durationMs", "tarifDwellMs", "hovers", "advisoryHovers",
     "tarifSwitches", "backPresses", "ctaHesitations", "cursorMoves", "cursorDistancePx",
     "hesitationScore", "overwhelmed"].join(","),
  ];

  let idx = 0;
  for (const { persona, count } of plan) {
    process.stdout.write(`  ${persona.name.padEnd(14)} → ${count} sessions `);
    for (let i = 0; i < count; i++) {
      const seed = SEED + idx * 7919 + i * 31;

      // (a) persona profile — written to disk immediately (no telemetry in file)
      sampler.rng = makeRng(seed);
      const profile = sampler.generatePersona(persona.segmentId);
      const fileId = `profile_${persona.id}_${seed}`;
      writeFileSync(join(sessDir, `${fileId}.json`), JSON.stringify(profile, null, 2));

      // (b) in-memory simulation for aggregate summary / index.csv only
      const snap = simulateSession(persona, seed, { profile, mode: "sim" });
      const { signals, classification } = analyzeSession(snap);

      const predicted = classification.match?.id || "none";
      const correct = predicted === persona.id;
      const dropStep = snap.abandons?.[0]?.step ?? (snap.completed ? null : snap.currentStep);

      sessions.push({ persona: persona.id, predicted, correct, completed: snap.completed, dropStep, signals, confidence: classification.match?.confidence || 0, snap, fileId, profileName: profile.persona_name });
      csvRows.push([
        fileId, persona.id, profile.persona_name, profile.demographics?.age ?? "",
        predicted, classification.match?.confidence || 0, correct,
        snap.completed, dropStep ?? "", dropStep != null ? (snap.pages[dropStep]?.name || "") : "",
        snap.totalDurationMs, signals.tarifDwellMs, snap.summary.hovers, signals.advisoryHovers,
        signals.tarifSwitches, signals.totalBack, signals.ctaHesitations, snap.summary.cursorMoves,
        snap.summary.cursorDistancePx, signals.hesitationScore, signals.overwhelmedTariff,
      ].join(","));
      idx++;
    }
    process.stdout.write("✓\n");
  }

  // ---- aggregate statistics -------------------------------------------------
  const perPersona = {};
  const confusion = {};
  let totalCorrect = 0;

  PERSONAS.forEach((p) => {
    const subset = sessions.filter((s) => s.persona === p.id);
    const n = subset.length;
    const correct = subset.filter((s) => s.correct).length;
    const completed = subset.filter((s) => s.completed).length;
    totalCorrect += correct;

    const predictedCounts = { judith: 0, franz: 0, peter: 0, none: 0 };
    const dropCounts = {}; const reachedCounts = {};
    FUNNEL_STEPS.forEach((s) => { dropCounts[s] = 0; reachedCounts[s] = 0; });
    subset.forEach((s) => {
      predictedCounts[s.predicted] += 1;
      if (s.dropStep != null && dropCounts[s.dropStep] != null) dropCounts[s.dropStep] += 1;
    });
    confusion[p.id] = predictedCounts;

    perPersona[p.id] = {
      name: p.name,
      runs: n,
      accuracyPct: pct(correct, n),
      completionPct: pct(completed, n),
      avgConfidence: correct ? Math.round(subset.filter((s) => s.correct).reduce((a, s) => a + s.confidence, 0) / correct) : 0,
      avgHesitation: Math.round(subset.reduce((a, s) => a + s.signals.hesitationScore, 0) / (n || 1)),
      overwhelmedPct: pct(subset.filter((s) => s.signals.overwhelmedTariff).length, n),
      dropByStep: Object.fromEntries(FUNNEL_STEPS.map((s) => [s, pct(dropCounts[s], n)])),
      predictedPct: Object.fromEntries(Object.entries(predictedCounts).map(([k, v]) => [k, pct(v, n)])),
    };
  });

  // gate analysis on the realistic visitor mix (all sessions together)
  const funnelStats = funnelGateStats(sessions.map((s) => s.snap));
  const benchmarkReport = compareToBenchmarks(funnelStats, {
    conversion: FUNNEL_CONTEXT.onlineConversionBaseline,
    initialPrice: FUNNEL_CONTEXT.baselineDropOffs.initialPrice,
    additionalCoverage: FUNNEL_CONTEXT.baselineDropOffs.additionalCoverage,
    finalPrice: FUNNEL_CONTEXT.baselineDropOffs.finalPrice,
  });

  const gateDrop = (step) => funnelStats.gateDropPct[step] ?? 0;
  const overallCompletion = funnelStats.conversionPct;

  const summary = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    params: { sessions: N, seed: SEED, gpt: USE_GPT, profileLinked: true },
    note: "Each file in sessions/ is the sampled persona profile only (persona_generator schema, no usage logs). summary.json and index.csv include in-memory simulation aggregates for QA.",
    segmentSplit: Object.fromEntries(plan.map(({ persona, count, share }) =>
      [persona.segmentId, { persona: persona.name, sharePct: Math.round(share * 100), count }])),
    overall: {
      totalSessions: sessions.length,
      classificationAccuracyPct: pct(totalCorrect, sessions.length),
      onlineConversionPct: overallCompletion,
      benchmarkConversionPct: FUNNEL_CONTEXT.onlineConversionBaseline * 100,
    },
    funnelGates: {
      initialPrice_step3: { simDropPct: gateDrop(3), benchmarkPct: FUNNEL_CONTEXT.baselineDropOffs.initialPrice * 100, withinTolerance: benchmarkReport.gates.initialPrice_step3?.withinTolerance },
      additionalCoverage_step4: { simDropPct: gateDrop(4), benchmarkPct: FUNNEL_CONTEXT.baselineDropOffs.additionalCoverage * 100, withinTolerance: benchmarkReport.gates.additionalCoverage_step4?.withinTolerance },
      finalPrice_step6: { simDropPct: gateDrop(6), benchmarkPct: FUNNEL_CONTEXT.baselineDropOffs.finalPrice * 100, withinTolerance: benchmarkReport.gates.finalPrice_step6?.withinTolerance },
    },
    benchmarkValidation: benchmarkReport,
    perPersona,
    confusionMatrix: confusion,
  };

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "index.csv"), csvRows.join("\n"));

  // ---- console report -------------------------------------------------------
  console.log(`\n  ── results ─────────────────────────────────`);
  console.log(`  classification accuracy : ${summary.overall.classificationAccuracyPct}%`);
  console.log(`  online conversion       : ${summary.overall.onlineConversionPct}%  (benchmark ${summary.overall.benchmarkConversionPct}%)`);
  console.log(`  drop @ initial price    : ${gateDrop(3)}%  (benchmark 66%)`);
  console.log(`  drop @ add-on coverage  : ${gateDrop(4)}%  (benchmark 24%)`);
  console.log(`  drop @ final price      : ${gateDrop(6)}%  (benchmark 78%)`);
  console.log(`  benchmark calibration   : ${benchmarkReport.allWithinTolerance ? "✓ within tolerance" : "⚠ see summary.json → benchmarkValidation"}`);
  console.log(`  per-persona accuracy    : ` +
    PERSONAS.map((p) => `${p.name.split(" ")[0]} ${perPersona[p.id].accuracyPct}%`).join(" · "));
  console.log(`\n  ✓ wrote ${sessions.length} profile files + summary.json + index.csv`);
  console.log(`    → ${outDir}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

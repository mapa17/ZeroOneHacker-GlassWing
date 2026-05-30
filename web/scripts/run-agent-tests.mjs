#!/usr/bin/env node
// Agent-mode test runner — profile-first, optional GPT form decisions.
//
// Unlike run-tests.mjs (pure simulator telemetry), this marks sessions as
// mode:"agent" and can use OpenAI to decide form values from the sampled profile.
// Telemetry timing/hovers still come from the calibrated simulator (realistic stats).
//
// Usage:
//   node scripts/run-agent-tests.mjs              # 50 agent sessions, deterministic form fill
//   node scripts/run-agent-tests.mjs --gpt        # GPT decides tariff/addons/health answers
//   node scripts/run-agent-tests.mjs --n 100 --seed 3

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PERSONAS, FUNNEL_CONTEXT } from "../src/data/personas.js";
import { simulateSession } from "../src/logic/personaSimulator.js";
import { analyzeSession, analysisForExport } from "../src/logic/personaClassifier.js";
import { funnelGateStats, compareToBenchmarks, visitorPlanFromTraffic } from "../src/logic/benchmarkValidation.js";
import { PersonaSampler, makeRng } from "../src/logic/personaProfileGenerator.js";
import { formFillFromProfile, normalizeAgentFormFill } from "../src/logic/profileFormFill.js";
import { fillFormFromProfile, maybeEnrich } from "./gpt.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PERSONAS_JSON = JSON.parse(readFileSync(join(ROOT, "personas", "personas.json"), "utf8"));
const TRAFFIC_SHARE = PERSONAS_JSON.shared_context?.online_funnel_traffic_share || {};

const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const N = parseInt(argVal("--n", "50"), 10);
const SEED = parseInt(argVal("--seed", "1"), 10);
const USE_GPT = args.includes("--gpt");
const RUN_ID = argVal("--run", `agent-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

async function main() {
  const outDir = join(ROOT, "test-results", RUN_ID);
  const sessDir = join(outDir, "sessions");
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(sessDir, { recursive: true });

  const plan = visitorPlanFromTraffic(N, PERSONAS, TRAFFIC_SHARE);
  const sampler = new PersonaSampler(PERSONAS_JSON);

  console.log(`\n▶ UNIQA agent-mode simulation "${RUN_ID}"`);
  console.log(`  ${N} sessions · seed ${SEED} · gpt form fill ${USE_GPT ? "on" : "off (profile-derived)"}\n`);

  const sessions = [];
  let idx = 0;

  for (const { persona, count } of plan) {
    process.stdout.write(`  ${persona.name.padEnd(14)} → ${count} `);
    for (let i = 0; i < count; i++) {
      const seed = SEED + idx * 7919 + i * 31;
      sampler.rng = makeRng(seed);
      const profile = sampler.generatePersona(persona.segmentId);

      let formFill = formFillFromProfile(profile, makeRng(seed + 17));
      let agentFormRaw = null;

      if (USE_GPT) {
        agentFormRaw = await fillFormFromProfile(profile, persona, seed);
        const normalized = normalizeAgentFormFill(agentFormRaw);
        if (normalized) formFill = normalized;
      }

      const snap = simulateSession(persona, seed, { profile, formFill, mode: "agent" });
      const { classification } = analyzeSession(snap);
      const analysis = analysisForExport(snap);

      const predicted = classification.match?.id || "none";
      const record = {
        ...snap,
        groundTruthPersona: persona.id,
        segmentId: persona.segmentId,
        predictedPersona: predicted,
        personaProfile: profile,
        personaAnalysis: analysis,
        agentFormFill: agentFormRaw || null,
        formFillSource: USE_GPT && agentFormRaw ? "gpt" : "profile",
      };

      if (USE_GPT) {
        const enrich = await maybeEnrich(persona, seed, profile);
        if (enrich) record.personaInstance = enrich;
      }

      writeFileSync(join(sessDir, `${snap.sessionId}.json`), JSON.stringify(record, null, 2));
      sessions.push({ snap, completed: snap.completed });
      idx++;
    }
    process.stdout.write("✓\n");
  }

  const funnelStats = funnelGateStats(sessions.map((s) => s.snap));
  const benchmarkReport = compareToBenchmarks(funnelStats, {
    conversion: FUNNEL_CONTEXT.onlineConversionBaseline,
    initialPrice: FUNNEL_CONTEXT.baselineDropOffs.initialPrice,
    additionalCoverage: FUNNEL_CONTEXT.baselineDropOffs.additionalCoverage,
    finalPrice: FUNNEL_CONTEXT.baselineDropOffs.finalPrice,
  });

  const summary = {
    runId: RUN_ID,
    mode: "agent",
    generatedAt: new Date().toISOString(),
    params: { sessions: N, seed: SEED, gptFormFill: USE_GPT },
    overall: {
      totalSessions: sessions.length,
      onlineConversionPct: funnelStats.conversionPct,
      benchmarkConversionPct: FUNNEL_CONTEXT.onlineConversionBaseline * 100,
    },
    funnelGates: funnelStats.gateDropPct,
    benchmarkValidation: benchmarkReport,
  };

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n  conversion: ${funnelStats.conversionPct}% (benchmark ${FUNNEL_CONTEXT.onlineConversionBaseline * 100}%)`);
  console.log(`  ✓ wrote ${sessions.length} agent sessions → ${outDir}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

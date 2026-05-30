#!/usr/bin/env node
// Compare a test run (or folder of real session JSONs) against UNIQA funnel benchmarks.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { funnelGateStats, compareToBenchmarks } from "../src/logic/benchmarkValidation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const runId = argVal("--run");
const realDir = argVal("--real-dir");

function loadSessionsFromDir(dir) {
  const sessDir = join(dir, "sessions");
  const target = existsSync(sessDir) ? sessDir : dir;
  return readdirSync(target)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(target, f), "utf8")));
}

function printReport(label, sessions, benchmarks) {
  const stats = funnelGateStats(sessions);
  const report = compareToBenchmarks(stats, benchmarks);
  console.log(`\n── ${label} (${sessions.length} sessions) ──`);
  console.log(`  conversion : ${report.conversion.simulatedPct}%  (benchmark ${report.conversion.benchmarkPct}%, Δ ${report.conversion.deltaPct}%) ${report.conversion.withinTolerance ? "✓" : "⚠"}`);
  Object.entries(report.gates).forEach(([key, g]) => {
    console.log(`  ${key} : ${g.simulatedDropPct}% drop  (benchmark ${g.benchmarkDropPct}%, Δ ${g.deltaPct}%) ${g.withinTolerance ? "✓" : "⚠"}`);
  });
  return report;
}

function main() {
  const personasJson = JSON.parse(readFileSync(join(ROOT, "personas", "personas.json"), "utf8"));
  const ctx = personasJson.shared_context?.current_online_conversion_baseline || {};
  const benchmarks = {
    conversion: ctx.rate ?? 0.056,
    initialPrice: ctx.drop_offs?.find((d) => d.step === "initial_price_display")?.rate ?? 0.66,
    additionalCoverage: ctx.drop_offs?.find((d) => d.step === "additional_coverage_selection")?.rate ?? 0.24,
    finalPrice: ctx.drop_offs?.find((d) => d.step === "final_price_after_health_questions")?.rate ?? 0.78,
  };

  if (runId) {
    const dir = join(ROOT, "test-results", runId);
    if (!existsSync(dir)) {
      console.error(`Run not found: ${dir}`);
      process.exit(1);
    }
    const sessions = loadSessionsFromDir(dir);
    printReport(`Simulated run "${runId}"`, sessions, benchmarks);
  } else if (realDir) {
    const sessions = loadSessionsFromDir(realDir);
    printReport(`Real sessions "${realDir}"`, sessions, benchmarks);
  } else {
    // latest run
    const base = join(ROOT, "test-results");
    if (!existsSync(base)) {
      console.error("No test-results folder. Run npm run sim:personas first.");
      process.exit(1);
    }
    const latest = readdirSync(base).sort().pop();
    const sessions = loadSessionsFromDir(join(base, latest));
    printReport(`Latest run "${latest}"`, sessions, benchmarks);
    if (realDir === null && args.includes("--compare-real") && argVal("--compare-real")) {
      const realSessions = loadSessionsFromDir(argVal("--compare-real"));
      printReport("Real reference", realSessions, benchmarks);
    }
  }
}

main();

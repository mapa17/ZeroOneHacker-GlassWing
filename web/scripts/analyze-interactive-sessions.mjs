#!/usr/bin/env node
// Aggregate interactive session drop-offs by step with leave reasons.

import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import {
  writeInteractiveAnalysis,
  printAnalysisSummary,
} from "../src/agent/analyzeInteractiveRun.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

function resolveDir() {
  const dir = argVal("--dir");
  if (dir) return dir;

  const runId = argVal("--run");
  const base = join(ROOT, "test-results");
  if (runId) return join(base, runId, "interactive-sessions");

  if (!existsSync(base)) throw new Error("No test-results/ folder.");
  const runs = readdirSync(base)
    .filter((d) => existsSync(join(base, d, "interactive-sessions")))
    .sort();
  if (!runs.length) throw new Error("No runs with interactive-sessions/ found.");
  return join(base, runs[runs.length - 1], "interactive-sessions");
}

const dir = resolveDir();
const runId = argVal("--run") || basename(dirname(dir));

console.log(`\n▶ Analyze interactive sessions`);
console.log(`  dir: ${dir}\n`);

const analysis = writeInteractiveAnalysis(dir, { runId });
printAnalysisSummary(analysis);
console.log(`\n  ✓ wrote analysis.json + dropoffs.csv + pauses.csv`);
console.log(`    → ${dir}\n`);

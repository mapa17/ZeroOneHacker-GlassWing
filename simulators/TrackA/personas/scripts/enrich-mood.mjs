#!/usr/bin/env node
// Add end-of-session mood to existing session JSONs (e.g. live400 batch).
//
// Usage:
//   node scripts/enrich-mood.mjs
//   node scripts/enrich-mood.mjs --run live400

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeMood } from "../src/logic/moodAnalysis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEST_RESULTS_DIR = join(ROOT, "test-results");

const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const RUN_ID = argVal("--run", "live400");

function main() {
  const runDir = join(TEST_RESULTS_DIR, RUN_ID);
  const sessDir = join(runDir, "sessions");
  if (!existsSync(sessDir)) throw new Error(`No sessions folder: ${sessDir}`);

  const files = readdirSync(sessDir).filter((f) => f.endsWith(".json")).sort();
  const counts = {};
  let updated = 0;

  for (const file of files) {
    const path = join(sessDir, file);
    const session = JSON.parse(readFileSync(path, "utf8"));
    session.mood = analyzeMood(session);
    writeFileSync(path, JSON.stringify(session, null, 2));
    counts[session.mood.label] = (counts[session.mood.label] || 0) + 1;
    updated += 1;
  }

  console.log(`\n▶ Mood enrichment for "${RUN_ID}" (${updated} sessions)\n`);
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([label, n]) => console.log(`  ${String(n).padStart(3)}  ${label}`));
  console.log(`\n  ✓ updated session JSONs in ${sessDir}`);
  console.log(`  → run: npm run summarize -- --run ${RUN_ID}\n`);
}

main();

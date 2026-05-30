#!/usr/bin/env node
// Persona profile sampler — input stage for the interactive LLM agent.
//
// Samples N persona profiles, split across the three segments by the online-funnel
// traffic share in personas/personas.json, and writes one profile JSON per persona
// into test-results/<run>/sessions/. These files are the input for:
//   1. npm run persona:prompts -- --run <runId>   (system-prompts/<base>.md)
//   2. npm run agent:interactive -- --run <runId>  (the LLM customer simulation)
//
// There is NO funnel simulation here — behaviour is produced only by the LLM agent
// (CLI) or by a human clicking through the web app.
//
// Usage:
//   node scripts/sample-profiles.mjs                 # 10 profiles, seed 1
//   node scripts/sample-profiles.mjs --n 25 --seed 7
//   node scripts/sample-profiles.mjs --run my-run-id

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PERSONAS } from "../src/data/personas.js";
import { PersonaSampler, makeRng } from "../src/logic/personaProfileGenerator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PERSONAS_JSON = JSON.parse(readFileSync(join(ROOT, "personas", "personas.json"), "utf8"));
const TRAFFIC_SHARE = PERSONAS_JSON.shared_context?.online_funnel_traffic_share || {};

const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const N = parseInt(argVal("--n", "10"), 10);
const SEED = parseInt(argVal("--seed", "1"), 10);
const RUN_ID = argVal("--run", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));

/** Split N profiles across segments by online-funnel traffic share. */
function visitorPlan(total) {
  const plan = [];
  let assigned = 0;
  PERSONAS.forEach((persona, idx) => {
    const share = TRAFFIC_SHARE[persona.segmentId] ?? 0;
    const count = idx === PERSONAS.length - 1 ? total - assigned : Math.round(total * share);
    assigned += count;
    plan.push({ persona, count, share });
  });
  return plan;
}

function main() {
  const outDir = join(ROOT, "test-results", RUN_ID);
  const sessDir = join(outDir, "sessions");
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(sessDir, { recursive: true });

  const plan = visitorPlan(N);

  console.log(`\n▶ Sampling ${N} persona profiles "${RUN_ID}" (seed ${SEED})`);
  plan.forEach(({ persona, count, share }) =>
    console.log(`  ${persona.segmentId} · ${persona.name.split(" ")[0].padEnd(7)} ${Math.round(share * 100)}% → ${count}`));

  const sampler = new PersonaSampler(PERSONAS_JSON);
  let idx = 0;
  let written = 0;
  for (const { persona, count } of plan) {
    for (let i = 0; i < count; i++) {
      const seed = SEED + idx * 7919 + i * 31;
      sampler.rng = makeRng(seed);
      const profile = sampler.generatePersona(persona.segmentId);
      const fileId = `profile_${persona.id}_${seed}`;
      writeFileSync(join(sessDir, `${fileId}.json`), JSON.stringify(profile, null, 2));
      written++;
      idx++;
    }
  }

  console.log(`\n  ✓ wrote ${written} profile files`);
  console.log(`    → ${sessDir}`);
  console.log(`\n  Next: npm run persona:prompts -- --run ${RUN_ID}\n`);
}

main();

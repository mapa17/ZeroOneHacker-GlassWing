#!/usr/bin/env node
// Command 1 of 2 — CREATE personas.
//
// Generates a desired number of realistic personas and auto-splits them across
// the three online-funnel segments by traffic share (S1 30% / S2 50% / S3 20%).
// Each persona is saved as its own JSON file in a pool folder so the second
// command (run-checks.mjs) can replay the exact same people through the funnel.
//
// Usage:
//   node scripts/create-personas.mjs --n 10
//   node scripts/create-personas.mjs --n 50 --seed 7
//   node scripts/create-personas.mjs --n 10 --out personas-pool
//
// Output: personas-pool/persona_<NN>_<segment>_<name>.json (pool is cleared first)

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PERSONAS } from "../src/data/personas.js";
import { PersonaSampler, makeRng } from "../src/logic/personaProfileGenerator.js";
import { visitorPlanFromTraffic } from "../src/logic/benchmarkValidation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PERSONAS_JSON = JSON.parse(readFileSync(join(ROOT, "personas", "personas.json"), "utf8"));
const TRAFFIC_SHARE = PERSONAS_JSON.shared_context?.online_funnel_traffic_share || {};

const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const N = parseInt(argVal("--n", "5"), 10);
const SEED = parseInt(argVal("--seed", "1"), 10);
const POOL_DIR = join(ROOT, argVal("--out", "personas-pool"));

const slug = (s) => String(s || "persona").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function main() {
  if (!Number.isFinite(N) || N < 1) {
    console.error("✖ --n must be a positive integer (how many personas to create).");
    process.exit(1);
  }

  const plan = visitorPlanFromTraffic(N, PERSONAS, TRAFFIC_SHARE);
  const sampler = new PersonaSampler(PERSONAS_JSON);

  // Fresh pool each time so a run always reflects the latest create command.
  if (existsSync(POOL_DIR)) rmSync(POOL_DIR, { recursive: true, force: true });
  mkdirSync(POOL_DIR, { recursive: true });

  console.log(`\n▶ Creating ${N} personas (seed ${SEED})`);
  console.log(`  split by traffic share : ` +
    plan.map(({ persona, count, share }) => `${persona.name.split(" ")[0]} ${Math.round(share * 100)}% → ${count}`).join("  ·  "));

  let idx = 0;
  for (const { persona, count } of plan) {
    for (let i = 0; i < count; i++) {
      const seed = SEED + idx * 7919 + i * 31;
      sampler.rng = makeRng(seed);
      const profile = sampler.generatePersona(persona.segmentId);
      const record = {
        index: idx + 1,
        segmentId: persona.segmentId,
        archetypeId: persona.id,
        archetypeName: persona.name,
        seed,
        profile,
      };
      const fileId = `persona_${String(idx + 1).padStart(3, "0")}_${persona.segmentId}_${slug(profile.persona_name)}`;
      writeFileSync(join(POOL_DIR, `${fileId}.json`), JSON.stringify(record, null, 2));
      idx++;
    }
  }

  console.log(`\n  ✓ ${idx} personas written to ${POOL_DIR}`);
  console.log(`  next: run the tests with  node scripts/run-checks.mjs   (or: npm run checks)\n`);
}

main();

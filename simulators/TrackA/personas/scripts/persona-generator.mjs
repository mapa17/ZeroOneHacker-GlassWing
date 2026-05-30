#!/usr/bin/env node
// Persona generator — Node/ESM port of persona_generator.py.
//
// Draws a concrete person from a UNIQA segment by sampling the population-level
// distributions in personas/personas.json. Output schema is identical to the
// reference p1_example.json so it can be merged with our other JSON outputs
// (e.g. a generated profile can be attached to a session telemetry file later).
//
// Usage:
//   node scripts/persona-generator.mjs 1                      # segment 1 (Judith), 1 persona → stdout
//   node scripts/persona-generator.mjs 2 --pretty
//   node scripts/persona-generator.mjs 3 --count 50 -o out.json
//   node scripts/persona-generator.mjs 1 --seed 42            # reproducible
//   node scripts/persona-generator.mjs 1 --json personas/personas.json
//
// Programmatic:
//   import { PersonaSampler } from "./persona-generator.mjs";
//   const s = new PersonaSampler(data); s.generatePersona("segment_1");

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PersonaSampler, makeRng } from "../src/logic/personaProfileGenerator.js";

export { PersonaSampler, makeRng } from "../src/logic/personaProfileGenerator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { segment: null, json: null, output: null, pretty: false, count: 1, seed: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pretty") args.pretty = true;
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--count" || a === "-c") args.count = parseInt(argv[++i], 10);
    else if (a === "--seed") args.seed = parseInt(argv[++i], 10);
    else if (a === "--json") args.json = argv[++i];
    else positional.push(a);
  }
  if (positional.length) args.segment = parseInt(positional[0], 10);
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const segmentMap = { 1: "segment_1", 2: "segment_2", 3: "segment_3" };

  if (!segmentMap[args.segment]) {
    console.error("Usage: node scripts/persona-generator.mjs <1|2|3> [--json path] [--count n] [--seed n] [--pretty] [-o out.json]");
    process.exit(1);
  }

  const jsonPath = args.json ? args.json : join(ROOT, "personas", "personas.json");
  if (!existsSync(jsonPath)) {
    console.error(`Error: File '${jsonPath}' not found.`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  const sampler = new PersonaSampler(data, makeRng(args.seed));
  const segmentId = segmentMap[args.segment];

  let outputData;
  if (args.count === 1) {
    outputData = sampler.generatePersona(segmentId);
  } else {
    outputData = {
      segment: segmentId,
      count: args.count,
      generated_personas: sampler.generateMultiple(segmentId, args.count),
    };
  }

  const text = args.pretty ? JSON.stringify(outputData, null, 2) : JSON.stringify(outputData);
  if (args.output) {
    writeFileSync(args.output, text);
    console.error(`Generated persona saved to ${args.output}`);
  } else {
    process.stdout.write(text + "\n");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

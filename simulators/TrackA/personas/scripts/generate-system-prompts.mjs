#!/usr/bin/env node
// System-prompt generator.
//
// For every persona profile JSON in a run's sessions/ folder:
//   1. Load the profile JSON.
//   2. Identify which UNIQA persona it is (segment_1→judith, _2→franz, _3→peter).
//   3. Fill personas/persona_prompt_template.md:
//        [MARKDOWN_CONTENT] ← the matching personas/<persona>.md
//        [JSON_CONTENT]     ← the profile JSON
//   4. Send the filled template to the OpenAI API.
//   5. Store the returned system prompt for that person separately.
//
// Output: test-results/<run>/system-prompts/<profileFile>.md
//
// Usage:
//   node scripts/generate-system-prompts.mjs                 # latest run
//   node scripts/generate-system-prompts.mjs --run <runId>
//   node scripts/generate-system-prompts.mjs --run <runId> --limit 10
//   node scripts/generate-system-prompts.mjs --dir path/to/sessions

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, hasOpenAIKey } from "./gpt.mjs";
import {
  resolvePersonaMd,
  fillPromptTemplate,
} from "../src/agent/personaPromptBuilder.js";
import { latestTestRunId } from "../src/testRunId.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PERSONAS_DIR = join(ROOT, "personas");
const TEMPLATE_PATH = join(PERSONAS_DIR, "persona_prompt_template.md");

const args = process.argv.slice(2);
const argVal = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

function resolveSessionsDir() {
  const dir = argVal("--dir");
  if (dir) return dir;

  const runId = argVal("--run");
  const base = join(ROOT, "test-results");
  if (runId) return join(base, runId, "sessions");

  if (!existsSync(base)) throw new Error("No test-results/ folder. Run npm run test:personas first.");
  const latest = latestTestRunId(base);
  if (!latest) throw new Error("No runs with a sessions/ folder found.");
  return join(base, latest, "sessions");
}

async function main() {
  if (!hasOpenAIKey()) {
    console.error("✖ No OPENAI_API_KEY found (.env or env). Cannot call the OpenAI API.");
    process.exit(1);
  }

  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const sessionsDir = resolveSessionsDir();
  if (!existsSync(sessionsDir)) {
    console.error(`✖ Sessions folder not found: ${sessionsDir}`);
    process.exit(1);
  }

  const outDir = join(dirname(sessionsDir), "system-prompts");
  mkdirSync(outDir, { recursive: true });

  const limit = argVal("--limit") ? parseInt(argVal("--limit"), 10) : Infinity;
  const files = readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".json"))
    .slice(0, limit);

  if (!files.length) {
    console.error(`✖ No profile JSON files in ${sessionsDir}`);
    process.exit(1);
  }

  console.log(`\n▶ Generating system prompts for ${files.length} personas`);
  console.log(`  sessions : ${sessionsDir}`);
  console.log(`  output   : ${outDir}\n`);

  // markdown cache so we don't re-read the same persona file repeatedly
  const mdCache = new Map();
  let ok = 0;
  let failed = 0;

  for (const file of files) {
    const profileText = readFileSync(join(sessionsDir, file), "utf8");
    let profile;
    try {
      profile = JSON.parse(profileText);
    } catch {
      console.warn(`  ⚠ ${file}: invalid JSON, skipped`);
      failed++;
      continue;
    }

    let mdPath;
    try {
      mdPath = resolvePersonaMd(profile);
    } catch (e) {
      console.warn(`  ⚠ ${file}: ${e.message}`);
      failed++;
      continue;
    }
    if (!mdCache.has(mdPath)) mdCache.set(mdPath, readFileSync(mdPath, "utf8"));
    const markdown = mdCache.get(mdPath);

    const prompt = fillPromptTemplate(template, markdown, profileText);

    process.stdout.write(`  ${file.padEnd(34)} (${profile.archetype_name}) `);
    try {
      const { text } = await generateText(prompt, { temperature: 0.7 });
      const base = basename(file, ".json");
      const header = `<!-- persona: ${profile.persona_name} · archetype: ${profile.archetype_name} · source: ${file} -->\n\n`;
      writeFileSync(join(outDir, `${base}.md`), header + text.trim() + "\n");
      console.log("✓");
      ok++;
    } catch (e) {
      console.log("✖");
      console.warn(`     ${e.message}`);
      failed++;
    }
  }

  console.log(`\n  ✓ ${ok} system prompts written · ${failed} failed`);
  console.log(`    → ${outDir}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// COACH EXPERIMENT — do dropped personas behave differently WITH the live chat coach?
//
// Takes personas that ALREADY DROPPED in a previous run, replays the exact same
// person (same profile + seed) through the REAL UI, but this time the persona can
// consult the on-screen coach and reconsider its decision. We then compare the
// new outcome to the original drop.
//
// Prereq: UI running with the coach proxy:
//   cd ui && npm run dev            # http://localhost:5173  (needs OPENAI_API_KEY in ../.env)
//
// Usage:
//   node scripts/run-coach-experiment.mjs                       # 50 from live400
//   node scripts/run-coach-experiment.mjs --n 50 --source live400 --concurrency 3 --speedup 20
//   node scripts/run-coach-experiment.mjs --headed --n 3        # watch a few

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { personaById } from "../src/data/personas.js";
import { runPersonaLive } from "../src/agent/liveFunnelDriver.js";
import { PAGE_NAMES, msToReadable } from "../src/logs/constants.js";
import { hasOpenAIKey, getOpenAIModel } from "./gpt.mjs";
import { nextTestRunId } from "../src/testRunId.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEST_RESULTS_DIR = join(ROOT, "test-results");

const args = process.argv.slice(2);
const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const hasFlag = (flag) => args.includes(flag);

const URL = argVal("--url", "http://localhost:5173");
const MODEL = argVal("--model", getOpenAIModel());
const SPEEDUP = Math.max(1, parseFloat(argVal("--speedup", "20")));
const CONCURRENCY = Math.max(1, parseInt(argVal("--concurrency", "3"), 10));
const N = parseInt(argVal("--n", "50"), 10);
const SOURCE = argVal("--source", "live400");
const HEADED = hasFlag("--headed");
const RUN_ID = argVal("--run", `coach-exp-${nextTestRunId(TEST_RESULTS_DIR).replace(/^test/, "")}`);

const slug = (s) => String(s || "p").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

const ARCHETYPE_BY_SEGMENT = { segment_1: "judith", segment_2: "franz", segment_3: "peter" };

async function serverUp(url) {
  try { const r = await fetch(url, { method: "GET" }); return r.ok || r.status < 500; } catch { return false; }
}

// Pick N dropped (in-scope) personas from a source run, evenly across the funnel
// steps where they dropped so the experiment covers the whole journey.
function loadDroppedPersonas(source, n) {
  const dir = join(TEST_RESULTS_DIR, source, "sessions");
  if (!existsSync(dir)) throw new Error(`Source run not found: ${dir}`);
  const dropped = readdirSync(dir)
    .filter((f) => f.startsWith("dropped") && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .filter((s) => s.profile && s.seed != null);

  // group by drop step, round-robin to get a representative spread
  const byStep = {};
  dropped.forEach((s) => { const st = s.stoppedAt?.step ?? 99; (byStep[st] = byStep[st] || []).push(s); });
  Object.values(byStep).forEach((arr) => arr.sort((a, b) => a.seed - b.seed));
  const steps = Object.keys(byStep).map(Number).sort((a, b) => a - b);

  const picked = [];
  let i = 0;
  while (picked.length < n && steps.some((st) => byStep[st].length > i)) {
    for (const st of steps) {
      if (byStep[st][i]) { picked.push(byStep[st][i]); if (picked.length >= n) break; }
    }
    i++;
  }
  return picked.slice(0, n);
}

async function main() {
  if (!hasOpenAIKey()) {
    console.error("✖ No OPENAI_API_KEY (../.env). The persona AND the coach both need the LLM.");
    process.exit(1);
  }
  if (!(await serverUp(URL))) {
    console.error(`✖ UI not reachable at ${URL}. Start it:  cd ui && npm run dev`);
    process.exit(1);
  }

  const picked = loadDroppedPersonas(SOURCE, N);
  if (!picked.length) { console.error(`✖ No dropped personas in ${SOURCE}.`); process.exit(1); }

  const outDir = join(TEST_RESULTS_DIR, RUN_ID);
  const sessDir = join(outDir, "sessions");
  const pairDir = join(outDir, "before_after"); // old + new side by side per persona
  mkdirSync(sessDir, { recursive: true });
  mkdirSync(pairDir, { recursive: true });
  const concurrency = HEADED ? 1 : CONCURRENCY;

  console.log(`\n▶ COACH EXPERIMENT "${RUN_ID}" — ${picked.length} previously-dropped personas from ${SOURCE}`);
  console.log(`  UI ${URL} · model ${MODEL} · ${SPEEDUP}x · concurrency ${concurrency} · coach ON`);
  console.log(`  (coach replies are REAL-time, not compressed)\n`);

  const browser = await chromium.launch({ headless: !HEADED });
  const rows = [];
  let done = 0;

  const runOne = async (orig) => {
    const archetypeId = ARCHETYPE_BY_SEGMENT[orig.profile.persona_id] || "franz";
    const archetype = personaById(archetypeId);
    const origStep = orig.stoppedAt?.step ?? "?";
    const origReason = orig.stoppedAt?.reasonCode || orig.stoppedAt?.reason || "?";
    let res;
    try {
      res = await runPersonaLive({
        browser, url: URL, profile: orig.profile, archetype, model: MODEL,
        seed: orig.seed, speedup: SPEEDUP, coachAssist: true,
      });
    } catch (e) {
      console.log(`  ${String(++done).padStart(3)}/${picked.length}  ${(orig.persona?.name || "?").padEnd(20)} | ERROR | ${e.message}`);
      return;
    }

    const newStatus = res.status;
    const newStep = res.stoppedAt?.step ?? res.outcome.reachedStep ?? "";
    const improved = newStatus === "completed_online"
      || (typeof newStep === "number" && typeof origStep === "number" && newStep > origStep)
      || (newStatus === "out_of_scope" && orig.status === "dropped"); // reached a real (advisory) endpoint
    const tag = newStatus === "completed_online" ? "PURCHASED✓"
      : newStatus === "out_of_scope" ? "→Beratung" : "Left";
    const rescued = (res.coachStats?.rescuedToContinue || 0) > 0;
    const exchanges = (res.walk || []).filter((w) => w.coach).map((w) => ({
      step: w.step, page: w.page,
      trigger: w.coach.trigger, askedProactively: !!w.coach.askedProactively,
      question: w.coach.question, coachReply: w.coach.coachReply,
      reconsideredAction: w.coach.reconsideredAction, changed: w.coach.changed,
      changeReason: w.coach.changeReason, choicePatch: w.coach.choicePatch || null,
    }));
    const proactiveQuestions = exchanges.filter((e) => e.askedProactively).length;

    rows.push({
      name: res.persona.name,
      segment: orig.profile.persona_id,
      origStatus: orig.status,
      origStep,
      origReason,
      newStatus,
      newStep,
      improved,
      converted: newStatus === "completed_online",
      coachInteractions: res.coachStats?.interactions || 0,
      changedDecisions: res.coachStats?.changedDecisions || 0,
      rescuedToContinue: res.coachStats?.rescuedToContinue || 0,
      tarifSwitches: res.coachStats?.tarifSwitches || 0,
      proactiveQuestions,
      humanTime: msToReadable(res.timeModel?.humanEquivalentTotalMs || 0),
    });

    console.log(
      `  ${String(++done).padStart(3)}/${picked.length}  ${(res.persona.name || "?").padEnd(20)} | ` +
      `was: drop@${origStep} (${origReason}) → now: ${tag}@${newStep}` +
      `${rescued ? "  ⟲rescued" : ""}${res.coachStats?.tarifSwitches ? "  ↺tarif" : ""}${proactiveQuestions ? "  ?asked" : ""}`,
    );

    const prefix = newStatus === "completed_online" ? "completed_online" : newStatus;
    writeFileSync(join(sessDir, `${prefix}_${slug(res.persona.name)}_${orig.seed}.json`), JSON.stringify(res, null, 2));

    // Paired before/after — old result and new result together in one folder.
    const delta = {
      persona: res.persona.name,
      seed: orig.seed,
      segment: orig.profile.persona_id,
      before: { status: orig.status, dropStep: origStep, reasonCode: origReason, stoppedAt: orig.stoppedAt || null },
      after: {
        status: newStatus, reachedStep: newStep, converted: newStatus === "completed_online",
        tarif: res.outcome?.tarif || null, tarifName: res.outcome?.tarifName || null,
        premiumPerMonth: res.outcome?.premiumPerMonth || null, stoppedAt: res.stoppedAt || null,
      },
      improved, converted: newStatus === "completed_online",
      coachExchanges: exchanges,
    };
    writeFileSync(
      join(pairDir, `${prefix}_${slug(res.persona.name)}_${orig.seed}.pair.json`),
      JSON.stringify({ delta, original: orig, coached: res }, null, 2),
    );
  };

  const queue = [...picked];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) { const rec = queue.shift(); if (rec) await runOne(rec); }
  });
  await Promise.all(workers);
  await browser.close();

  // ── comparison summary ──────────────────────────────────────────────────
  const n = rows.length;
  const converted = rows.filter((r) => r.converted);
  const improvedRows = rows.filter((r) => r.improved);
  const anyCoach = rows.filter((r) => r.coachInteractions > 0);
  const changed = rows.filter((r) => r.changedDecisions > 0);

  const byOrigStep = {};
  rows.forEach((r) => {
    const k = r.origStep;
    byOrigStep[k] = byOrigStep[k] || { origDropStep: k, n: 0, nowConverted: 0, nowAdvanced: 0 };
    byOrigStep[k].n++;
    if (r.converted) byOrigStep[k].nowConverted++;
    if (r.improved) byOrigStep[k].nowAdvanced++;
  });

  const summary = {
    runId: RUN_ID,
    experiment: "dropped personas replayed WITH live coach",
    source: SOURCE,
    model: MODEL,
    speedup: SPEEDUP,
    personas: n,
    baseline: "all of these ORIGINALLY dropped (0% conversion)",
    withCoach: {
      convertedOnline: converted.length,
      convertedPct: pct(converted.length, n),
      improvedOrAdvanced: improvedRows.length,
      improvedPct: pct(improvedRows.length, n),
      reachedAdvisoryEndpoint: rows.filter((r) => r.newStatus === "out_of_scope").length,
    },
    coachEngagement: {
      personasWhoConsultedCoach: anyCoach.length,
      personasWhoChangedADecision: changed.length,
      personasWhoAskedProactively: rows.filter((r) => r.proactiveQuestions > 0).length,
      totalProactiveQuestions: rows.reduce((s, r) => s + r.proactiveQuestions, 0),
      totalTarifSwitches: rows.reduce((s, r) => s + r.tarifSwitches, 0),
      totalRescues: rows.reduce((s, r) => s + r.rescuedToContinue, 0),
    },
    byOriginalDropStep: Object.values(byOrigStep).sort((a, b) => a.origDropStep - b.origDropStep),
    rows,
  };
  writeFileSync(join(outDir, "comparison.json"), JSON.stringify(summary, null, 2));

  console.log(`\n  ══ COACH EXPERIMENT RESULT (n=${n}) ══`);
  console.log(`  These ${n} personas ALL dropped originally (0% conversion baseline).`);
  console.log(`  With the coach:`);
  console.log(`    • converted online      : ${converted.length}  (${summary.withCoach.convertedPct}%)`);
  console.log(`    • advanced further / improved: ${improvedRows.length}  (${summary.withCoach.improvedPct}%)`);
  console.log(`    • reached advisory endpoint  : ${summary.withCoach.reachedAdvisoryEndpoint}`);
    console.log(`    • consulted coach        : ${anyCoach.length}   · changed a decision: ${changed.length}`);
    console.log(`    • asked coach proactively: ${summary.coachEngagement.personasWhoAskedProactively}   (${summary.coachEngagement.totalProactiveQuestions} questions)`);
    console.log(`    • tariff switches        : ${summary.coachEngagement.totalTarifSwitches}   · rescues (stay vs leave): ${summary.coachEngagement.totalRescues}`);
  console.log(`\n  by original drop step:`);
  summary.byOriginalDropStep.forEach((b) =>
    console.log(`    drop@${String(b.origDropStep).padEnd(2)} → ${b.nowConverted}/${b.n} converted · ${b.nowAdvanced}/${b.n} improved`),
  );
  console.log(`\n  ✓ ${rows.length} sessions + comparison.json → ${outDir}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

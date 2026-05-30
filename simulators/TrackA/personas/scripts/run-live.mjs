#!/usr/bin/env node
// LIVE funnel checks — run the created personas through the REAL hosted UNIQA UI
// in a real browser, so every time is genuine wall-clock time measured by the
// app's own tracking (no estimated/algorithmic time anywhere).
//
// Prereq: start the UI yourself first (in another terminal):
//   cd ui && npm install && npm run dev      # serves http://localhost:5173
//
// Then create personas and run live:
//   node scripts/create-personas.mjs --n 6
//   node scripts/run-live.mjs                       # default http://localhost:5173
//   node scripts/run-live.mjs --url http://localhost:5173 --speed 1 --limit 6
//   node scripts/run-live.mjs --headed              # watch the browser drive the form
//
// Output: test-results/<testN>/sessions/*.json + summary.json  (telemetry = REAL UI data)

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
const SPEED = parseFloat(argVal("--speed", "1"));
const SPEEDUP = Math.max(1, parseFloat(argVal("--speedup", "1")));
const CONCURRENCY = Math.max(1, parseInt(argVal("--concurrency", "1"), 10));
const LIMIT = parseInt(argVal("--limit", "9999"), 10);
const POOL_DIR = join(ROOT, argVal("--pool", "personas-pool"));
const HEADED = hasFlag("--headed");
const RUN_ID = argVal("--run", nextTestRunId(TEST_RESULTS_DIR));

const slug = (s) => String(s || "p").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const avgInt = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

async function serverUp(url) {
  try { const r = await fetch(url, { method: "GET" }); return r.ok || r.status < 500; } catch { return false; }
}

function loadPool() {
  if (!existsSync(POOL_DIR)) return [];
  return readdirSync(POOL_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(POOL_DIR, f), "utf8")));
}

async function main() {
  if (!hasOpenAIKey()) {
    console.error("✖ No OPENAI_API_KEY found (.env or env). The live persona needs the LLM to decide each step.");
    process.exit(1);
  }
  if (!(await serverUp(URL))) {
    console.error(`✖ UI not reachable at ${URL}.\n  Start it first:  cd ui && npm install && npm run dev\n  Or point --url at where you host it.`);
    process.exit(1);
  }

  const pool = loadPool().slice(0, LIMIT);
  if (!pool.length) {
    console.error(`✖ No personas in ${POOL_DIR}. Create them first:  node scripts/create-personas.mjs --n 6`);
    process.exit(1);
  }

  const outDir = join(TEST_RESULTS_DIR, RUN_ID);
  const sessDir = join(outDir, "sessions");
  mkdirSync(sessDir, { recursive: true });

  // Headed mode is for watching → force one-at-a-time so a single window is followable.
  const concurrency = HEADED ? 1 : CONCURRENCY;

  console.log(`\n▶ LIVE funnel checks "${RUN_ID}" on ${pool.length} personas`);
  console.log(`  UI: ${URL} · model ${MODEL} · ${SPEEDUP}x speedup · concurrency ${concurrency} · ${HEADED ? "headed" : "headless"}`);
  console.log(`  interactions+telemetry = REAL · human reading/typing time compressed ${SPEEDUP}x then reconstructed\n`);

  const browser = await chromium.launch({ headless: !HEADED });
  const sessions = [];
  let done = 0;

  const runOne = async (rec) => {
    const archetype = personaById(rec.archetypeId);
    let res;
    try {
      res = await runPersonaLive({ browser, url: URL, profile: rec.profile, archetype, model: MODEL, seed: rec.seed, speed: SPEED, speedup: SPEEDUP });
    } catch (e) {
      console.log(`  ${String(++done).padStart(3)}/${pool.length}  ${(rec.profile.persona_name || "?").padEnd(20)} | ERROR | ${e.message}`);
      return;
    }
    const action = res.status === "completed_online" ? "Purchased" : res.status === "out_of_scope" ? "Stopped" : "Left";
    const st = res.stoppedAt?.step ?? res.outcome.reachedStep ?? "";
    const pageName = PAGE_NAMES[st] || res.stoppedAt?.page || "";
    const detail = res.stoppedAt?.detail || res.walk[res.walk.length - 1]?.concern || "";
    const human = msToReadable(res.timeModel?.humanEquivalentTotalMs || 0);
    console.log(`  ${String(++done).padStart(3)}/${pool.length}  ${(res.persona.name || "?").padEnd(20)} | ${action.padEnd(9)} | @ ${st} "${pageName}" · ~${human} human${detail ? `  — ${detail}` : ""}`);

    const prefix = res.status === "completed_online" ? "completed_online" : res.status;
    writeFileSync(join(sessDir, `${prefix}_${slug(res.persona.name)}_${rec.seed}.json`), JSON.stringify(res, null, 2));
    sessions.push(res);
  };

  // simple worker pool
  const queue = [...pool];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) { const rec = queue.shift(); if (rec) await runOne(rec); }
  });
  await Promise.all(workers);

  await browser.close();

  // ---- aggregate (REAL times) ----------------------------------------------
  const inScope = sessions.filter((s) => !s.outOfScope);
  const purchased = sessions.filter((s) => s.completedOnline);
  const left = inScope.filter((s) => s.status === "dropped");
  const stopped = sessions.filter((s) => s.outOfScope);

  // human-equivalent per-step (the real-time each page represents) from the walk
  const humanPerStep = {};
  const stepSet = new Set();
  sessions.forEach((s) => (s.walk || []).forEach((w) => stepSet.add(Number(w.step))));
  [...stepSet].sort((a, b) => a - b).forEach((step) => {
    const times = sessions.flatMap((s) => (s.walk || []).filter((w) => w.step === step).map((w) => w.humanEquivalentMs)).filter((v) => typeof v === "number");
    const ms = avgInt(times);
    humanPerStep[`${step}_${PAGE_NAMES[step] || step}`] = { avgHumanMs: ms, avgHumanReadable: msToReadable(ms), reachedBy: times.length };
  });

  const totalHuman = avgInt(sessions.map((s) => s.timeModel?.humanEquivalentTotalMs).filter((v) => typeof v === "number"));
  const totalRecorded = avgInt(sessions.map((s) => s.timeModel?.recordedTotalMs).filter((v) => typeof v === "number"));
  const summary = {
    runId: RUN_ID,
    runMode: "live_ui",
    url: URL,
    model: MODEL,
    speedup: SPEEDUP,
    concurrency,
    timeSource: "real UI interactions; human reading/typing time compressed " + SPEEDUP + "x and reconstructed to 1x",
    personas: sessions.length,
    purchasedOnline: purchased.length,
    leftInScope: left.length,
    stoppedOutOfScope: stopped.length,
    inScopeConversionPct: pct(purchased.length, inScope.length),
    avgHumanEquivalentTotalMs: totalHuman,
    avgHumanEquivalentTotalReadable: msToReadable(totalHuman),
    avgRecordedCompressedMs: totalRecorded,
    avgRecordedCompressedReadable: msToReadable(totalRecorded),
    avgHumanTimePerStep: humanPerStep,
    stopReasons: stopped.reduce((m, s) => { const r = s.stoppedAt?.reason || "?"; m[r] = (m[r] || 0) + 1; return m; }, {}),
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\n  ── results ─────────────────────────────────`);
  console.log(`  personas              : ${sessions.length}`);
  console.log(`  purchased (online)    : ${purchased.length}`);
  console.log(`  left (in scope)       : ${left.length}`);
  console.log(`  stopped (out of scope): ${stopped.length}  ${JSON.stringify(summary.stopReasons)}`);
  console.log(`  in-scope conversion   : ${summary.inScopeConversionPct}%`);
  console.log(`  avg time (human-equiv): ${summary.avgHumanEquivalentTotalReadable}   (actually ran in ~${summary.avgRecordedCompressedReadable}/persona at ${SPEEDUP}x)`);
  console.log(`\n  ── avg human-equivalent time per page ──────`);
  Object.entries(humanPerStep).forEach(([k, v]) => console.log(`  ${k.padEnd(28)} ${v.avgHumanReadable.padStart(7)}  (n=${v.reachedBy})`));
  console.log(`\n  ✓ wrote ${sessions.length} session logs + summary.json → ${outDir}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

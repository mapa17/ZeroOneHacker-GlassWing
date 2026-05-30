#!/usr/bin/env node
// Command 2 of 2 — RUN the funnel checks on the created personas.
//
// Loads the personas saved by create-personas.mjs (personas-pool/) and walks each
// one through the UNIQA online quote funnel PAGE BY PAGE using an LLM that acts as
// that exact person. It recreates the real process: the persona makes each choice
// in character, hesitates, and either purchases, leaves, or is stopped by one of
// the four out-of-scope edge cases.
//
// For every persona you get a ready .json log (full page-by-page walk + thoughts),
// and the terminal prints one compact line per persona:
//
//   Name(Anna Wagner) action(stopped) @ 0 "Absicherungsbereich"  · Im Krankenhaus gewählt
//   Name(Eva Lang)    action(purchased) @ 8 "Ergebnis"
//   Name(Peter Wagner) action(left) @ 3 "Tarif-Auswahl"  · zu teuer / überfordert
//
// Out-of-scope sessions (hospital cover / others / advice-only tariff / health
// "ja") are EXCLUDED from the conversion denominator.
//
// Usage:
//   node scripts/create-personas.mjs --n 10   # first create the personas
//   node scripts/run-checks.mjs               # then run the tests on them
//   node scripts/run-checks.mjs --concurrency 5 --model gpt-5.4-mini
//
// Output: test-results/<testN>/sessions/*.json + summary.json + index.csv

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PERSONAS, personaById } from "../src/data/personas.js";
import { OUT_OF_SCOPE_REASONS, PAGE_BY_STEP, RESULT_STEP, DROP_REASON_CODES } from "../src/logic/funnelPages.js";
import { runPersonaThroughFunnel } from "../src/agent/personaFunnelAgent.js";
import { STEP_BENCHMARK_SEC } from "../src/logic/telemetrySynth.js";
import { PAGE_NAMES, msToReadable } from "../src/logs/constants.js";
import { hasOpenAIKey, getOpenAIModel } from "./gpt.mjs";
import { nextTestRunId } from "../src/testRunId.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEST_RESULTS_DIR = join(ROOT, "test-results");
const PERSONAS_JSON = JSON.parse(readFileSync(join(ROOT, "personas", "personas.json"), "utf8"));

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MODEL = argVal("--model", getOpenAIModel());
const CONCURRENCY = Math.max(1, parseInt(argVal("--concurrency", "1"), 10));
const POOL_DIR = join(ROOT, argVal("--pool", "personas-pool"));
const RUN_ID = argVal("--run", nextTestRunId(TEST_RESULTS_DIR));

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

// ---- demographic banding + aggregation helpers ----------------------------
const incomeBand = (eur) => {
  const n = Number(eur) || 0;
  if (n < 1500) return "<€1.500";
  if (n < 2500) return "€1.500–2.499";
  if (n < 3500) return "€2.500–3.499";
  if (n < 4500) return "€3.500–4.499";
  return "€4.500+";
};
const ageBand = (age) => {
  const n = Number(age) || 0;
  if (n < 30) return "18–29";
  if (n < 45) return "30–44";
  if (n < 60) return "45–59";
  return "60+";
};
const reasonOf = (s) => s.stoppedAt?.reasonCode || "other";
const reasonLabel = (code) => DROP_REASON_CODES[code] || code;
// Drops where money is the real lever (used for the affordability lens).
const PRICE_REASONS = new Set(["price_vs_income", "weak_value", "final_price_commitment"]);

const avgInt = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);

// Average behavioural telemetry (time, clicks, hesitation signals) over a group of
// sessions — so each segment / persona type gets its typical stats.
function behavioralFor(subset) {
  const t = subset.map((s) => s.telemetry).filter(Boolean);
  if (!t.length) return null;
  const perStep = {};
  const stepSet = new Set();
  t.forEach((x) => Object.keys(x.pages || {}).forEach((k) => stepSet.add(Number(k))));
  [...stepSet].sort((a, b) => a - b).forEach((step) => {
    const times = t.map((x) => x.pages?.[step]?.totalTimeMs).filter((v) => typeof v === "number");
    const think = t.map((x) => x.pages?.[step]?.thinkingMs).filter((v) => typeof v === "number");
    if (!times.length) return;
    const ms = avgInt(times);
    const benchSec = STEP_BENCHMARK_SEC[step];
    const toks = t.map((x) => x.pages?.[step]?.tokens?.completion).filter((v) => typeof v === "number");
    perStep[`${step}_${PAGE_NAMES[step] || step}`] = {
      avgMeasuredReasoningMs: ms,
      avgMeasuredReasoningReadable: msToReadable(ms),
      avgReasoningTokens: avgInt(toks),
      humanBenchmarkSec: benchSec ?? null,
      avgThinkingMs: avgInt(think),
      reachedBy: times.length,
    };
  });
  const total = avgInt(t.map((x) => x.totalDurationMs));
  return {
    sessions: t.length,
    avgTotalReasoningMs: total,
    avgTotalReasoningReadable: msToReadable(total),
    avgReasoningTokens: avgInt(t.map((x) => x.summary.totalReasoningTokens || 0)),
    avgButtonClicks: avgInt(t.map((x) => x.summary.totalButtonClicks)),
    avgBackPresses: avgInt(t.map((x) => x.summary.backPresses)),
    avgHovers: avgInt(t.map((x) => x.summary.hovers)),
    avgFieldsInteracted: avgInt(t.map((x) => x.summary.fieldsInteracted)),
    avgCursorMoves: avgInt(t.map((x) => x.summary.cursorMoves)),
    avgCursorDistancePx: avgInt(t.map((x) => x.summary.cursorDistancePx)),
    avgTimePerStep: perStep,
  };
}

// reason × demographic-band cross-tab, each cell with its dominant reason.
function crossTabReasons(rows, bandFn) {
  const out = {};
  rows.forEach((s) => {
    const band = bandFn(s);
    const code = reasonOf(s);
    out[band] = out[band] || { total: 0, reasons: {} };
    out[band].total += 1;
    out[band].reasons[code] = (out[band].reasons[code] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(out).map(([band, v]) => {
      const sorted = Object.entries(v.reasons).sort((a, b) => b[1] - a[1]);
      return [band, {
        total: v.total,
        topReason: sorted[0] ? { code: sorted[0][0], label: reasonLabel(sorted[0][0]), count: sorted[0][1] } : null,
        reasons: Object.fromEntries(sorted.map(([c, n]) => [`${c} (${reasonLabel(c)})`, n])),
      }];
    }),
  );
}

// Load the personas created by create-personas.mjs.
function loadPool() {
  if (!existsSync(POOL_DIR)) return [];
  return readdirSync(POOL_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const rec = JSON.parse(readFileSync(join(POOL_DIR, f), "utf8"));
      const archetype = personaById(rec.archetypeId) ||
        PERSONAS.find((p) => p.segmentId === rec.segmentId) || null;
      return { profile: rec.profile, archetype, seed: rec.seed ?? 1 };
    });
}

// Map a session status to the action word the user wants in the terminal.
function actionFor(status) {
  if (status === "completed_online") return "purchased";
  if (status === "out_of_scope") return "stopped";
  return "left";
}

// Concurrency pool so larger runs aren't painfully sequential.
async function runPool(jobs, worker, concurrency) {
  const results = new Array(jobs.length);
  let next = 0;
  async function lane() {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await worker(jobs[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, lane));
  return results;
}

async function main() {
  if (!hasOpenAIKey()) {
    console.error("✖ No OPENAI_API_KEY found (.env in personas/, workspace root, or environment).");
    console.error("  These checks are LLM-driven and cannot run without a key.");
    process.exit(1);
  }

  const jobs = loadPool();
  if (!jobs.length) {
    console.error(`✖ No personas found in ${POOL_DIR}.`);
    console.error("  Create them first:  node scripts/create-personas.mjs --n 10");
    process.exit(1);
  }

  const outDir = join(TEST_RESULTS_DIR, RUN_ID);
  const sessDir = join(outDir, "sessions");
  mkdirSync(sessDir, { recursive: true });

  console.log(`\n▶ Running funnel checks "${RUN_ID}" on ${jobs.length} personas (model ${MODEL}, concurrency ${CONCURRENCY})\n`);

  const slugName = (s) => String(s || "persona").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const sessions = await runPool(jobs, async (job) => {
    const rec = await runPersonaThroughFunnel(job.profile, job.archetype, { model: MODEL, seed: job.seed });
    const fileId = `${rec.status}_${slugName(rec.persona.name)}_${job.seed}`;
    writeFileSync(join(sessDir, `${fileId}.json`), JSON.stringify({ fileId, ...rec }, null, 2));
    rec.fileId = fileId;

    // Compact per-persona terminal line: Name | Action | @ <step> "Step name"
    const action = actionFor(rec.status);
    const Action = action.charAt(0).toUpperCase() + action.slice(1);
    const step = rec.status === "completed_online" ? RESULT_STEP : (rec.stoppedAt?.step ?? "?");
    const page = rec.status === "completed_online" ? "Ergebnis" : (rec.stoppedAt?.page ?? "?");
    const why = rec.status === "completed_online" ? "" : `  — ${rec.stoppedAt?.detail || rec.stoppedAt?.reason || ""}`;
    console.log(`${rec.persona.name} | ${Action} | @ ${step} "${page}"${why}`);
    return rec;
  }, CONCURRENCY);

  writeReports(outDir, sessions);
}

// Turn the aggregates into a few clear, human-readable sentences.
function buildNarrative({ dropped, dropReasons, dropByPage, reasonBySegment, priceStats }) {
  if (!dropped.length) return ["No in-scope drop-offs in this run."];
  const out = [];
  const top = dropReasons[0];
  out.push(`${dropped.length} people left the online funnel. The single biggest driver was "${top.label}" (${top.count}/${dropped.length}, ${top.pct}%).`);

  const topStep = Object.entries(dropByPage).sort((a, b) => b[1] - a[1])[0];
  if (topStep) out.push(`Most of them leave at "${topStep[0]}" (${topStep[1]} of ${dropped.length}).`);

  if (priceStats.count) {
    const band = priceStats.topPriceBand ? `, concentrated in the ${priceStats.topPriceBand} income band` : "";
    const share = priceStats.avgPriceShare != null ? ` The monthly premium they faced averaged ${priceStats.avgPriceShare}% of their income` : "";
    out.push(`${priceStats.count} left primarily over money${band}.${share} — i.e. the price only reads as "too high" relative to what they earn, not in absolute terms.`);
  }

  const segLines = Object.entries(reasonBySegment)
    .filter(([, v]) => v.topReason)
    .map(([seg, v]) => `${seg} → mostly "${v.topReason.label}" (${v.topReason.count}/${v.total})`);
  if (segLines.length) out.push(`By segment: ${segLines.join("; ")}.`);

  return out;
}

function writeReports(outDir, sessions) {
  const total = sessions.length;
  const completedOnline = sessions.filter((s) => s.status === "completed_online");
  const dropped = sessions.filter((s) => s.status === "dropped");
  const outOfScope = sessions.filter((s) => s.status === "out_of_scope");
  const inScope = total - outOfScope.length;

  const oosByReason = {};
  const oosByStep = {};
  Object.keys(OUT_OF_SCOPE_REASONS).forEach((r) => { oosByReason[r] = 0; });
  outOfScope.forEach((s) => {
    const r = s.stoppedAt?.reason;
    if (r in oosByReason) oosByReason[r] += 1;
    const st = s.stoppedAt?.step;
    oosByStep[st] = (oosByStep[st] || 0) + 1;
  });

  const dropByStep = {};
  dropped.forEach((s) => {
    const st = s.stoppedAt?.step;
    dropByStep[st] = (dropByStep[st] || 0) + 1;
  });
  const dropByPage = Object.fromEntries(
    Object.entries(dropByStep).map(([st, n]) => [`${st}_${PAGE_BY_STEP[st]?.name || st}`, n])
  );

  // ---- WHY they left: categorised, quantified, segmented ------------------
  const byReasonCode = {};
  dropped.forEach((s) => { const c = reasonOf(s); byReasonCode[c] = (byReasonCode[c] || 0) + 1; });
  const dropReasons = Object.entries(byReasonCode)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, label: reasonLabel(code), count, pct: pct(count, dropped.length) }));

  const reasonByIncomeBand = crossTabReasons(dropped, (s) => incomeBand(s.profile?.demographics?.income_monthly_eur));
  const reasonByAgeBand = crossTabReasons(dropped, (s) => ageBand(s.persona?.age));
  const reasonBySegment = crossTabReasons(dropped, (s) => s.persona?.segment || s.persona?.segmentId || "?");

  // Affordability lens — a price is only "too high" relative to what you earn.
  const priceDrops = dropped.filter((s) => PRICE_REASONS.has(reasonOf(s)));
  const shareVals = priceDrops.map((s) => s.stoppedAt?.priceShareOfIncomePct).filter((v) => typeof v === "number");
  const avgPriceShare = shareVals.length ? Math.round((shareVals.reduce((a, b) => a + b, 0) / shareVals.length) * 10) / 10 : null;
  const priceDropsByIncome = {};
  priceDrops.forEach((s) => {
    const b = incomeBand(s.profile?.demographics?.income_monthly_eur);
    priceDropsByIncome[b] = (priceDropsByIncome[b] || 0) + 1;
  });
  const topPriceBand = Object.entries(priceDropsByIncome).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const narrative = buildNarrative({ dropped, dropReasons, dropByPage, reasonBySegment, priceStats: { count: priceDrops.length, avgPriceShare, topPriceBand } });

  const dropReasonAnalysis = {
    note:
      "WHY in-scope leavers abandoned, beyond 'the price is too high'. Each leaver emits the single closest " +
      "reason code; we then break those reasons down by income band, age band and segment, and quantify the " +
      "shown price as a share of each person's income — so a price reaction is read against what they earn.",
    summary: narrative,
    byReason: dropReasons,
    byIncomeBand: reasonByIncomeBand,
    byAgeBand: reasonByAgeBand,
    bySegment: reasonBySegment,
    affordability: {
      priceRelatedDrops: priceDrops.length,
      avgPriceShareOfIncomePct: avgPriceShare,
      priceDropsByIncomeBand: priceDropsByIncome,
      mostAffectedIncomeBand: topPriceBand,
    },
  };

  const perSegment = {};
  const segmentSplit = {};
  PERSONAS.forEach((p) => {
    const subset = sessions.filter((s) => s.persona.segmentId === p.segmentId);
    const oos = subset.filter((s) => s.status === "out_of_scope").length;
    const comp = subset.filter((s) => s.status === "completed_online").length;
    segmentSplit[p.segmentId] = { persona: p.name, count: subset.length };
    perSegment[p.segmentId] = {
      persona: p.name,
      total: subset.length,
      completedOnline: comp,
      droppedInScope: subset.filter((s) => s.status === "dropped").length,
      outOfScope: oos,
      inScopeConversionPct: pct(comp, subset.length - oos),
    };
  });

  // Behavioural telemetry averages — overall and per persona type / segment.
  const behavioralStats = {
    note:
      "Time per step is REAL — the measured wall-clock latency of each screen's reasoning LLM call (not an " +
      "estimate). avgReasoningTokens is the real deliberation volume. Button clicks, back-navigations, hovers " +
      "and fields are real interaction markers placed within each step's measured time window; the cursor is " +
      "an aggregate movement proxy. humanBenchmarkSec is a reference for how long a real person takes (the " +
      "model reasons faster than a human, so use the RELATIVE differences across steps/personas to train the coach). " +
      "For the cleanest timings run with --concurrency 1 (parallel calls add network variance).",
    humanBenchmarkPerStepSec: STEP_BENCHMARK_SEC,
    overall: behavioralFor(sessions),
    bySegment: {},
  };
  PERSONAS.forEach((p) => {
    const subset = sessions.filter((s) => s.persona.segmentId === p.segmentId);
    const stats = behavioralFor(subset);
    if (stats) behavioralStats.bySegment[p.segmentId] = { persona: p.name, ...stats };
  });

  const summary = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    engine: "llm_page_by_page",
    params: { personas: total, model: MODEL },
    note:
      "Each session is one persona walked page-by-page by an LLM acting as that person. " +
      "Out-of-scope sessions (hospital cover / other people / advice-only tariff / health declaration) " +
      "are EXCLUDED from the conversion denominator — they leave the online path for a legitimate reason.",
    segmentSplit,
    totals: {
      personas: total,
      completedOnline: completedOnline.length,
      droppedInScope: dropped.length,
      outOfScope: outOfScope.length,
      inScope,
    },
    conversion: {
      inScopeConversionPct: pct(completedOnline.length, inScope),
      rawConversionPct: pct(completedOnline.length, total),
      benchmarkPct: (PERSONAS_JSON.shared_context?.current_online_conversion_baseline?.rate ?? 0.056) * 100,
    },
    outOfScope: {
      total: outOfScope.length,
      byReason: Object.fromEntries(Object.entries(oosByReason).map(([k, v]) => [k, { count: v, label: OUT_OF_SCOPE_REASONS[k] }])),
      byStep: oosByStep,
    },
    inScopeDropOff: {
      total: dropped.length,
      byPage: dropByPage,
      examples: dropped.slice(0, 10).map((s) => ({
        persona: s.persona.name,
        age: s.persona.age,
        income: s.profile?.demographics?.income_monthly_eur,
        segment: s.persona.segment,
        step: s.stoppedAt?.step,
        page: s.stoppedAt?.page,
        reasonCode: s.stoppedAt?.reasonCode,
        reason: reasonLabel(s.stoppedAt?.reasonCode),
        priceShareOfIncomePct: s.stoppedAt?.priceShareOfIncomePct ?? null,
        thoughts: s.stoppedAt?.detail,
      })),
    },
    dropReasonAnalysis,
    behavioralStats,
    perSegment,
  };

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

  const header = ["file", "name", "gender", "age", "income", "segment", "action", "status", "lastStep", "lastPage", "reason", "dropReasonCode", "priceShareOfIncomePct", "tarif", "premium", "reasoningMs", "reasoningTime", "reasoningTokens", "buttonClicks", "backPresses", "hovers", "thoughts"];
  const rows = sessions.map((s) => {
    const last = s.walk[s.walk.length - 1] || {};
    const tm = s.telemetry || {};
    const sum = tm.summary || {};
    const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;
    const action = s.status === "completed_online" ? "purchased" : s.status === "out_of_scope" ? "stopped" : "left";
    return [
      s.fileId, s.persona.name, s.persona.gender, s.persona.age, s.profile?.demographics?.income_monthly_eur ?? "", s.persona.segmentId,
      action, s.status, s.stoppedAt?.step ?? RESULT_STEP, s.stoppedAt?.page ?? "Ergebnis", s.stoppedAt?.reason ?? "",
      s.stoppedAt?.reasonCode ?? "", s.stoppedAt?.priceShareOfIncomePct ?? "",
      s.outcome.tarif ?? "", s.outcome.premiumPerMonth ?? "",
      tm.totalDurationMs ?? "", tm.totalDurationReadable ?? "", sum.totalReasoningTokens ?? "", sum.totalButtonClicks ?? "", sum.backPresses ?? "", sum.hovers ?? "",
      last.thoughts ?? "",
    ].map(csvCell).join(",");
  });
  writeFileSync(join(outDir, "index.csv"), [header.map((h) => `"${h}"`).join(","), ...rows].join("\n"));

  console.log(`\n  ── results ─────────────────────────────────`);
  console.log(`  personas              : ${total}`);
  console.log(`  purchased (online)    : ${completedOnline.length}`);
  console.log(`  left (in scope)       : ${dropped.length}`);
  console.log(`  stopped (out of scope): ${outOfScope.length}  ${JSON.stringify(oosByReason)}`);
  console.log(`  in-scope conversion   : ${summary.conversion.inScopeConversionPct}%  (raw ${summary.conversion.rawConversionPct}%, benchmark ${summary.conversion.benchmarkPct}%)`);
  console.log(`  in-scope drop-off     : ${JSON.stringify(dropByPage)}`);

  if (dropped.length) {
    console.log(`\n  ── why they left (reasons) ─────────────────`);
    dropReasons.forEach((r) => console.log(`  ${String(r.count).padStart(3)} (${String(r.pct).padStart(4)}%)  ${r.label}`));
    if (priceDrops.length) {
      console.log(`  affordability: ${priceDrops.length} left over money` +
        `${avgPriceShare != null ? `, avg ${avgPriceShare}% of income` : ""}` +
        `${topPriceBand ? `, most in ${topPriceBand}` : ""}`);
    }
    console.log(`\n  ── summary ─────────────────────────────────`);
    narrative.forEach((l) => console.log(`  • ${l}`));
  }

  console.log(`\n  ── behaviour by segment (measured) ─────────`);
  Object.values(behavioralStats.bySegment).forEach((b) => {
    console.log(`  ${b.persona.padEnd(14)} ${String(b.sessions).padStart(2)} sess · ${b.avgTotalReasoningReadable.padStart(7)} think · ${String(b.avgReasoningTokens).padStart(5)} tok · ${String(b.avgButtonClicks).padStart(2)} clicks · ${String(b.avgBackPresses).padStart(2)} backs`);
  });

  console.log(`\n  ✓ wrote ${total} session logs + summary.json + index.csv`);
  console.log(`    → ${outDir}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });

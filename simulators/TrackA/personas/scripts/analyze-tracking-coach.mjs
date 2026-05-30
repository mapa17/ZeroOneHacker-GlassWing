#!/usr/bin/env node
/**
 * Coach-facing patterns using ONLY observable UI tracking (no persona profile).
 * Usage: node scripts/analyze-tracking-coach.mjs --run live400
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMood } from "../src/logic/moodAnalysis.js";
import { DROP_REASON_CODES } from "../src/logic/funnelPages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RUN = process.argv.includes("--run") ? process.argv[process.argv.indexOf("--run") + 1] : "live400";
const sessDir = join(ROOT, "test-results", RUN, "sessions");

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const med = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function pageMs(s, step) {
  const ui = s.telemetry?.pages?.[step]?.totalTimeMs;
  if (typeof ui === "number") return ui;
  return s.timeModel?.perStep?.find((p) => p.step === step)?.humanEquivalentMs ?? null;
}

function extractTracking(s) {
  const tel = s.telemetry || {};
  const sum = tel.summary || {};
  const btns = tel.buttons || {};
  const totalMs = tel.totalDurationMs || s.timeModel?.recordedTotalMs || 0;
  const humanMs = s.timeModel?.humanEquivalentTotalMs || 0;

  const stepMs = {};
  for (let i = 0; i <= 8; i++) stepMs[i] = pageMs(s, i);

  const reachedStep = tel.currentStep ?? s.stoppedAt?.step ?? s.walk?.at(-1)?.step ?? 0;
  const tarifSelected = sum.selectedTarif || s.selections?.tarif || null;
  const addonCount = Object.values(sum.selectedAddons || s.selections?.addons || {}).filter(Boolean).length;

  return {
    // Session-level (coach accumulates over time)
    totalMs,
    humanMs,
    pagesVisited: sum.pagesVisited ?? 0,
    clicks: sum.totalButtonClicks ?? 0,
    backPresses: sum.backPresses ?? sum.backButtonClicks ?? 0,
    fields: sum.fieldsInteracted ?? 0,
    hovers: sum.hovers ?? 0,
    cursorMoves: sum.cursorMoves ?? 0,
    cursorDistancePx: sum.cursorDistancePx ?? 0,
    events: sum.events ?? 0,

    // Per-step dwell (ms) — key coach signal
    stepMs,

    // Step reached
    reachedStep,
    reachedTarif: reachedStep >= 3 || !!tarifSelected,
    reachedStep6: reachedStep >= 6,

    // Clicks by type (if available)
    nextClicks: btns.next ?? 0,
    tarifSelectStart: btns.tarif_select_start ?? 0,
    tarifSelectOptimal: btns.tarif_select_optimal ?? 0,
    modeSwitchData: btns.mode_switch_data ?? 0,

    // Selections visible in tracking
    tarifSelected,
    addonCount,
    projectedRoute: sum.projectedRoute || null,

    // Derived behavior classes (observable thresholds)
    sessionPace:
      humanMs < 72000 ? "fast" : humanMs < 150000 ? "medium" : "slow",
    tarifDwellMs: stepMs[3] ?? 0,
    tarifDwellClass:
      (stepMs[3] ?? 0) < 45000 ? "tarif_quick" : (stepMs[3] ?? 0) < 90000 ? "tarif_compare" : "tarif_stuck",
    engagementLevel:
      (sum.cursorMoves ?? 0) >= 25 ? "high" : (sum.cursorMoves ?? 0) >= 12 ? "medium" : "low",
    clickIntensity:
      (sum.totalButtonClicks ?? 0) >= 10 ? "high_clicks" : (sum.totalButtonClicks ?? 0) >= 6 ? "mid_clicks" : "low_clicks",
  };
}

function extractOutcome(s) {
  const m = s.mood || analyzeMood(s);
  return {
    purchased: s.status === "completed_online",
    exitStep: s.stoppedAt?.step ?? 8,
    reasonCode: s.stoppedAt?.reasonCode || s.walk?.at(-1)?.dropReasonCode || "other",
    reasonLabel: DROP_REASON_CODES[s.stoppedAt?.reasonCode] || s.stoppedAt?.reasonCode,
    tarif: s.outcome?.tarif || s.selections?.tarif,
    premium: s.outcome?.premiumPerMonth,
    mood: m.label,
  };
}

const sessions = readdirSync(sessDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const raw = JSON.parse(readFileSync(join(sessDir, f), "utf8"));
    return { raw, tr: extractTracking(raw), out: extractOutcome(raw) };
  });

const baseline = pct(sessions.filter((s) => s.out.purchased).length, sessions.length);

function cohort(label, filterFn) {
  const rows = sessions.filter(filterFn);
  if (rows.length < 10) return null;
  const purchased = rows.filter((r) => r.out.purchased);
  const dropped = rows.filter((r) => !r.out.purchased);
  const reasons = {};
  const moods = {};
  const exitSteps = {};
  const tarifs = {};
  dropped.forEach((r) => {
    reasons[r.out.reasonCode] = (reasons[r.out.reasonCode] || 0) + 1;
    moods[r.out.mood] = (moods[r.out.mood] || 0) + 1;
    exitSteps[r.out.exitStep] = (exitSteps[r.out.exitStep] || 0) + 1;
  });
  purchased.forEach((r) => {
    if (r.out.tarif) tarifs[r.out.tarif] = (tarifs[r.out.tarif] || 0) + 1;
  });
  const topR = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  const topM = Object.entries(moods).sort((a, b) => b[1] - a[1])[0];
  const topT = Object.entries(tarifs).sort((a, b) => b[1] - a[1])[0];
  const topE = Object.entries(exitSteps).sort((a, b) => b[1] - a[1])[0];

  return {
    label,
    n: rows.length,
    conversionPct: pct(purchased.length, rows.length),
    liftVsBaseline: Math.round((pct(purchased.length, rows.length) - baseline) * 10) / 10,
    avgTotalSec: Math.round(avg(rows.map((r) => r.tr.totalMs)) / 100) / 10,
    avgHumanMin: Math.round(avg(rows.map((r) => r.tr.humanMs)) / 600) / 100,
    avgTarifSec: Math.round(avg(rows.map((r) => r.tr.tarifDwellMs).filter(Boolean)) / 100) / 10,
    avgClicks: Math.round(avg(rows.map((r) => r.tr.clicks))),
    avgCursor: Math.round(avg(rows.map((r) => r.tr.cursorMoves))),
    avgFields: Math.round(avg(rows.map((r) => r.tr.fields))),
    reachStep6Pct: pct(rows.filter((r) => r.tr.reachedStep6).length, rows.length),
    ifDrop: topR
      ? { reason: DROP_REASON_CODES[topR[0]], code: topR[0], pct: pct(topR[1], dropped.length) }
      : null,
    ifDropMood: topM?.[0],
    ifDropStep: topE ? { step: Number(topE[0]), pct: pct(topE[1], dropped.length) } : null,
    ifBuyTarif: topT ? { tarif: topT[0], count: topT[1] } : null,
  };
}

// ── Tracking-only cohorts ───────────────────────────────────────────────────
const cohorts = [
  cohort("Fast session (<1.2 min human-equiv)", (r) => r.tr.sessionPace === "fast"),
  cohort("Medium session (1.2–2.5 min)", (r) => r.tr.sessionPace === "medium"),
  cohort("Slow session (>2.5 min)", (r) => r.tr.sessionPace === "slow"),
  cohort("Tariff: quick dwell (<45s on step 3)", (r) => r.tr.tarifDwellClass === "tarif_quick"),
  cohort("Tariff: comparing (45–90s on step 3)", (r) => r.tr.tarifDwellClass === "tarif_compare"),
  cohort("Tariff: stuck (>90s on step 3)", (r) => r.tr.tarifDwellClass === "tarif_stuck"),
  cohort("Low engagement (cursor <12)", (r) => r.tr.engagementLevel === "low"),
  cohort("High engagement (cursor 25+)", (r) => r.tr.engagementLevel === "high"),
  cohort("Low clicks (≤5)", (r) => r.tr.clickIntensity === "low_clicks"),
  cohort("High clicks (10+)", (r) => r.tr.clickIntensity === "high_clicks"),
  cohort("Reached step 6", (r) => r.tr.reachedStep6),
  cohort("Never reached step 3", (r) => !r.tr.reachedTarif),
  cohort("Selected Start tariff", (r) => r.tr.tarifSelected === "start"),
  cohort("Selected Optimal tariff", (r) => r.tr.tarifSelected === "optimal"),
  cohort("Any back navigation", (r) => r.tr.backPresses > 0),
  cohort("Zero hovers", (r) => r.tr.hovers === 0),
  cohort("3+ hovers", (r) => r.tr.hovers >= 3),
  cohort("Opened data/tracking panel (mode_switch_data)", (r) => r.tr.modeSwitchData > 0),
].filter(Boolean);

// ── Real-time trigger rules (partial session state) ─────────────────────────
// Simulated: at moment user is ON step X with accumulated signals
const triggers = [
  {
    id: "T1_fast_step3",
    when: "On step 3, session < 90s total, ≤5 clicks",
    match: (r) => r.out.exitStep === 3 && r.tr.humanMs < 90000 && r.tr.clicks <= 5,
    coachAction: "Ask 'Online abschließen oder Beratung?' — show 2-tariff simplified view",
  },
  {
    id: "T2_long_tarif_no_select",
    when: "On step 3, tariff page > 60s, no tariff selected yet",
    match: (r) => r.tr.tarifDwellMs > 60000 && !r.tr.tarifSelected && r.out.exitStep === 3,
    coachAction: "Recommend Start vs Optimal side-by-side; explain advisory-only tariffs",
  },
  {
    id: "T3_tarif_selected_start",
    when: "Selected Start, moving past step 3",
    match: (r) => r.tr.tarifSelected === "start",
    coachAction: "Confirm value fit; skip addon upsell; keep momentum",
  },
  {
    id: "T4_tarif_selected_optimal_slow",
    when: "Selected Optimal + slow session (researcher)",
    match: (r) => r.tr.tarifSelected === "optimal" && r.tr.sessionPace === "slow",
    coachAction: "Summarize what Optimal adds vs Start; pre-empt step 6 commitment fear",
  },
  {
    id: "T5_step6_slow",
    when: "Reached step 6, session > 2.5 min",
    match: (r) => r.tr.reachedStep6 && r.tr.sessionPace === "slow" && !r.out.purchased,
    coachAction: "Commitment reassurance (cooling-off, no surprise price) — #1 save point",
  },
  {
    id: "T6_step6_slow_buyer",
    when: "Reached step 6, session > 2.5 min, purchased",
    match: (r) => r.tr.reachedStep6 && r.tr.sessionPace === "slow" && r.out.purchased,
    coachAction: "Light nudge only — they convert at 28%; don't overload",
  },
  {
    id: "T7_low_cursor_early_drop",
    when: "Low cursor (<12), exit step ≤ 2",
    match: (r) => r.tr.engagementLevel === "low" && r.out.exitStep <= 2,
    coachAction: "Explain step purpose in one line; offer human chat",
  },
  {
    id: "T8_high_clicks_step3_drop",
    when: "10+ clicks, dropped at step 3",
    match: (r) => r.tr.clicks >= 10 && r.out.exitStep === 3 && !r.out.purchased,
    coachAction: "Decision fatigue — recommend ONE tariff with reason",
  },
  {
    id: "T9_prefer_human_signal",
    when: "Fast + low clicks + step ≤ 3 + reason prefer_human",
    match: (r) => r.tr.sessionPace === "fast" && r.tr.clicks <= 6 && r.out.reasonCode === "prefer_human",
    coachAction: "Phone/callback CTA immediately — tracking shows disengagement",
  },
  {
    id: "T10_final_commitment_signal",
    when: "Step 6 exit + reason final_price_commitment",
    match: (r) => r.out.exitStep === 6 && r.out.reasonCode === "final_price_commitment",
    coachAction: "Show income vs premium bar + 'Kostenlos widerrufbar' — not a new tariff pitch",
  },
];

const triggerStats = triggers.map((t) => {
  const matched = sessions.filter((r) => t.match(r));
  if (matched.length < 3) return null;
  const purchased = matched.filter((r) => r.out.purchased);
  const topReason = Object.entries(
    matched.filter((r) => !r.out.purchased).reduce((o, r) => {
      o[r.out.reasonCode] = (o[r.out.reasonCode] || 0) + 1;
      return o;
    }, {}),
  ).sort((a, b) => b[1] - a[1])[0];
  return {
    ...t,
    n: matched.length,
    conversionPct: pct(purchased.length, matched.length),
    topDropReason: topReason ? DROP_REASON_CODES[topReason[0]] : null,
    coachAction: t.coachAction,
  };
}).filter(Boolean);

// ── Step-by-step: what tracking at step N predicts ──────────────────────────
const atStep = [0, 1, 2, 3, 4, 5, 6].map((step) => {
  const exitedHere = sessions.filter((r) => r.out.exitStep === step && !r.out.purchased);
  if (exitedHere.length < 5) return null;
  return {
    exitStep: step,
    drops: exitedHere.length,
    avgHumanMinAtExit: Math.round(avg(exitedHere.map((r) => r.tr.humanMs)) / 600) / 100,
    avgClicksAtExit: Math.round(avg(exitedHere.map((r) => r.tr.clicks))),
    avgCursorAtExit: Math.round(avg(exitedHere.map((r) => r.tr.cursorMoves))),
    avgTarifSecBeforeExit: step >= 3 ? null : Math.round(avg(exitedHere.map((r) => r.tr.stepMs[3] || 0)) / 100) / 10,
    topReason: Object.entries(
      exitedHere.reduce((o, r) => { o[r.out.reasonCode] = (o[r.out.reasonCode] || 0) + 1; return o; }, {}),
    ).sort((a, b) => b[1] - a[1])[0]?.[0],
    topMood: Object.entries(
      exitedHere.reduce((o, r) => { o[r.out.mood] = (o[r.out.mood] || 0) + 1; return o; }, {}),
    ).sort((a, b) => b[1] - a[1])[0]?.[0],
  };
}).filter(Boolean);

const report = {
  run: RUN,
  n: sessions.length,
  baselineConversionPct: baseline,
  note:
    "All patterns use ONLY telemetry + timeModel + selections + outcome. " +
    "No persona profile (segment, income, drivers) — what the live coach can observe.",
  observableSignals: [
    "totalDurationMs / per-step page totalTimeMs",
    "totalButtonClicks, backPresses, fieldsInteracted",
    "hovers, cursorMoves, cursorDistancePx",
    "selectedTarif, selectedAddons, projectedRoute",
    "currentStep / pagesVisited",
    "button keys (next, tarif_select_*, mode_switch_data)",
  ],
  trackingCohorts: cohorts.sort((a, b) => b.n - a.n),
  realtimeTriggers: triggerStats.sort((a, b) => b.n - a.n),
  dropProfileByExitStep: atStep,
  topPatternsForCoach: [
    {
      rank: 1,
      signal: "Never reached step 3",
      n: cohorts.find((c) => c.label.startsWith("Never"))?.n,
      conversionPct: cohorts.find((c) => c.label.startsWith("Never"))?.conversionPct,
      predict: "Wrong product/channel — prefer human or confusion",
      intervene: "Simplify step 0–2, offer Beratung before tariff",
    },
    {
      rank: 2,
      signal: "Fast session + low clicks + drop at step 3",
      predict: "advisory_wall or prefer_human",
      intervene: "2-choice tariff, callback CTA",
    },
    {
      rank: 3,
      signal: "Tariff dwell > 90s + drop at step 3",
      predict: "advisory_wall / want_to_compare",
      intervene: "Pick ONE recommendation, explain Plus = Beratung only",
    },
    {
      rank: 4,
      signal: "Selected Start + high clicks + reaches step 6",
      predict: "Highest buy probability",
      intervene: "Minimal friction, no addon push",
    },
    {
      rank: 5,
      signal: "Reached step 6 + slow session (>2.5 min)",
      predict: "28% buy OR final_price_commitment drop",
      intervene: "Commitment coach, not repricing",
    },
    {
      rank: 6,
      signal: "High cursor (25+) + high clicks (10+)",
      predict: "Engaged but often drops step 3 anyway",
      intervene: "Decision fatigue — force recommendation",
    },
    {
      rank: 7,
      signal: "Low cursor (<12) + exit step 0–2",
      predict: "not_sure_applies / prefer_human",
      intervene: "Explain options in plain language early",
    },
    {
      rank: 8,
      signal: "Selected Optimal + medium/slow pace",
      predict: "Buys Optimal if completes; drops at 6 on commitment",
      intervene: "Pre-step-6 price lock message",
    },
  ],
};

const outPath = join(ROOT, "test-results", RUN, "tracking-coach-patterns.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`\n▶ Tracking-only coach patterns (${RUN}, n=${sessions.length}, baseline ${baseline}%)\n`);
console.log("── What tracking alone can predict ──\n");
cohorts.sort((a, b) => Math.abs(b.conversionPct - baseline) - Math.abs(a.conversionPct - baseline)).slice(0, 8).forEach((c) => {
  console.log(`  ${c.label}`);
  console.log(`    n=${c.n} · ${c.conversionPct}% buy (${c.liftVsBaseline >= 0 ? "+" : ""}${c.liftVsBaseline}pp)`);
  console.log(`    Tracking: ${c.avgHumanMin} min · tariff ${c.avgTarifSec}s · ${c.avgClicks} clicks · ${c.avgCursor} cursor · step6 ${c.reachStep6Pct}%`);
  console.log(`    If drop → ${c.ifDrop?.reason || "—"} @ step ${c.ifDropStep?.step} · mood ${c.ifDropMood}`);
  console.log(`    If buy → ${c.ifBuyTarif?.tarif || "—"}\n`);
});

console.log("── Real-time triggers (coach can fire mid-session) ──\n");
triggerStats.slice(0, 8).forEach((t) => {
  console.log(`  ${t.when}`);
  console.log(`    matched ${t.n} end states · ${t.conversionPct}% bought · drop: ${t.topDropReason || "—"}`);
  console.log(`    → ${t.coachAction}\n`);
});

console.log(`  ✓ ${outPath}\n`);

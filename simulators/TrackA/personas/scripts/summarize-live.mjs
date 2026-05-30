#!/usr/bin/env node
// Build a rich summary for an existing live-UI run (e.g. test-results/live400).
// Reads all session JSONs and writes summary.json + index.csv with full analysis
// for purchased vs dropped cohorts.
//
// Usage:
//   node scripts/summarize-live.mjs
//   node scripts/summarize-live.mjs --run live400

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PERSONAS } from "../src/data/personas.js";
import { DROP_REASON_CODES, PAGE_BY_STEP, OUT_OF_SCOPE_REASONS, RESULT_STEP } from "../src/logic/funnelPages.js";
import { PAGE_NAMES, msToReadable } from "../src/logs/constants.js";
import { analyzeMood } from "../src/logic/moodAnalysis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEST_RESULTS_DIR = join(ROOT, "test-results");

const args = process.argv.slice(2);
const argVal = (flag, def) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const RUN_ID = argVal("--run", "live400");

const PERSONAS_JSON = JSON.parse(readFileSync(join(ROOT, "personas", "personas.json"), "utf8"));
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const avgInt = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);
const avgFloat = (nums, dec = 1) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10 ** dec) / 10 ** dec : null);

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
const reasonLabel = (code) => DROP_REASON_CODES[code] || code;
const PRICE_REASONS = new Set(["price_vs_income", "weak_value", "final_price_commitment"]);

function reasonOf(s) {
  if (s.stoppedAt?.reasonCode) return s.stoppedAt.reasonCode;
  const last = s.walk?.[s.walk.length - 1];
  return last?.dropReasonCode || "other";
}

function moodOf(s) {
  return s.mood || analyzeMood(s);
}

function moodStats(subset) {
  if (!subset.length) return null;
  const byLabel = {};
  const byValence = {};
  subset.forEach((s) => {
    const m = moodOf(s);
    byLabel[m.label] = (byLabel[m.label] || 0) + 1;
    const v = String(m.valence);
    byValence[v] = (byValence[v] || 0) + 1;
  });
  const valences = subset.map((s) => moodOf(s).valence).filter((v) => typeof v === "number");
  const intensities = subset.map((s) => moodOf(s).intensity).filter((v) => typeof v === "number");
  return {
    count: subset.length,
    avgValence: avgFloat(valences, 2),
    avgIntensity: avgFloat(intensities, 1),
    byLabel: Object.fromEntries(Object.entries(byLabel).sort((a, b) => b[1] - a[1])),
    byValence,
  };
}

function moodByBand(subset, bandFn) {
  const out = {};
  subset.forEach((s) => {
    const band = bandFn(s);
    out[band] = out[band] || { total: 0, moods: {} };
    out[band].total += 1;
    const label = moodOf(s).label;
    out[band].moods[label] = (out[band].moods[label] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(out).map(([band, v]) => {
      const top = Object.entries(v.moods).sort((a, b) => b[1] - a[1])[0];
      return [band, { total: v.total, topMood: top ? { label: top[0], count: top[1] } : null, breakdown: v.moods }];
    }),
  );
}

function priceShareOf(s) {
  if (typeof s.stoppedAt?.priceShareOfIncomePct === "number") return s.stoppedAt.priceShareOfIncomePct;
  for (let i = (s.walk || []).length - 1; i >= 0; i--) {
    if (typeof s.walk[i].priceShareOfIncomePct === "number") return s.walk[i].priceShareOfIncomePct;
  }
  return null;
}

function countBy(rows, bandFn) {
  const out = {};
  rows.forEach((s) => { const b = bandFn(s); out[b] = (out[b] || 0) + 1; });
  return out;
}

function crossTab(rows, bandFn, valueFn) {
  const out = {};
  rows.forEach((s) => {
    const band = bandFn(s);
    out[band] = out[band] || { total: 0, values: {} };
    out[band].total += 1;
    const v = valueFn(s);
    out[band].values[v] = (out[band].values[v] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(out).map(([band, v]) => {
      const sorted = Object.entries(v.values).sort((a, b) => b[1] - a[1]);
      return [band, { total: v.total, top: sorted[0] ? { key: sorted[0][0], count: sorted[0][1] } : null, breakdown: Object.fromEntries(sorted) }];
    }),
  );
}

function crossTabReasons(rows, bandFn) {
  return crossTab(rows, bandFn, reasonOf);
}

function humanTimePerStep(subset) {
  const perStep = {};
  const stepSet = new Set();
  subset.forEach((s) => (s.walk || []).forEach((w) => stepSet.add(Number(w.step))));
  [...stepSet].sort((a, b) => a - b).forEach((step) => {
    const human = subset.flatMap((s) => (s.walk || []).filter((w) => w.step === step).map((w) => w.humanEquivalentMs)).filter((v) => typeof v === "number");
    const recorded = subset.flatMap((s) => (s.walk || []).filter((w) => w.step === step).map((w) => w.realCompressedMs)).filter((v) => typeof v === "number");
    const ui = subset.map((s) => s.telemetry?.pages?.[step]?.totalTimeMs).filter((v) => typeof v === "number");
    perStep[`${step}_${PAGE_NAMES[step] || step}`] = {
      reachedBy: human.length,
      avgHumanMs: avgInt(human),
      avgHumanReadable: msToReadable(avgInt(human)),
      avgRecordedMs: avgInt(recorded),
      avgRecordedReadable: msToReadable(avgInt(recorded)),
      avgUiMeasuredMs: avgInt(ui),
      avgUiMeasuredReadable: msToReadable(avgInt(ui)),
    };
  });
  return perStep;
}

function behavioralFor(subset) {
  const t = subset.map((s) => s.telemetry).filter(Boolean);
  if (!t.length) return null;
  return {
    sessions: t.length,
    avgHumanTotalMs: avgInt(subset.map((s) => s.timeModel?.humanEquivalentTotalMs).filter((v) => typeof v === "number")),
    avgHumanTotalReadable: msToReadable(avgInt(subset.map((s) => s.timeModel?.humanEquivalentTotalMs).filter((v) => typeof v === "number"))),
    avgUiRecordedMs: avgInt(t.map((x) => x.totalDurationMs)),
    avgUiRecordedReadable: msToReadable(avgInt(t.map((x) => x.totalDurationMs))),
    avgButtonClicks: avgInt(t.map((x) => x.summary?.totalButtonClicks)),
    avgBackPresses: avgInt(t.map((x) => x.summary?.backPresses)),
    avgHovers: avgInt(t.map((x) => x.summary?.hovers)),
    avgFieldsInteracted: avgInt(t.map((x) => x.summary?.fieldsInteracted)),
    avgCursorMoves: avgInt(t.map((x) => x.summary?.cursorMoves)),
    avgCursorDistancePx: avgInt(t.map((x) => x.summary?.cursorDistancePx)),
    avgTimePerStep: humanTimePerStep(subset),
  };
}

function cohortProfile(subset) {
  if (!subset.length) return null;
  const incomes = subset.map((s) => s.profile?.demographics?.income_monthly_eur).filter((v) => typeof v === "number");
  const ages = subset.map((s) => s.persona?.age).filter((v) => typeof v === "number");
  const premiums = subset.map((s) => s.outcome?.premiumPerMonth).filter((v) => typeof v === "number");
  const shares = subset.map(priceShareOf).filter((v) => typeof v === "number");
  const tarifs = {};
  subset.forEach((s) => { const k = s.outcome?.tarif || s.selections?.tarif; if (k) tarifs[k] = (tarifs[k] || 0) + 1; });
  const addons = {};
  subset.forEach((s) => {
    Object.entries(s.selections?.addons || {}).filter(([, on]) => on).forEach(([k]) => { addons[k] = (addons[k] || 0) + 1; });
  });
  return {
    count: subset.length,
    avgAge: avgFloat(ages),
    avgIncomeEur: avgInt(incomes),
    avgPremiumEur: avgFloat(premiums, 2),
    avgPriceShareOfIncomePct: avgFloat(shares),
    byIncomeBand: countBy(subset, (s) => incomeBand(s.profile?.demographics?.income_monthly_eur)),
    byAgeBand: countBy(subset, (s) => ageBand(s.persona?.age)),
    bySegment: countBy(subset, (s) => s.persona?.segment || "?"),
    tarifChoices: tarifs,
    addonChoices: addons,
    behavioral: behavioralFor(subset),
  };
}

function examples(subset, n = 8) {
  return subset.slice(0, n).map((s) => {
    const last = s.walk?.[s.walk.length - 1] || {};
    return {
      name: s.persona?.name,
      age: s.persona?.age,
      income: s.profile?.demographics?.income_monthly_eur,
      segment: s.persona?.segment,
      step: s.stoppedAt?.step ?? RESULT_STEP,
      page: s.stoppedAt?.page ?? "Ergebnis",
      reasonCode: reasonOf(s),
      reason: reasonLabel(reasonOf(s)),
      priceShareOfIncomePct: priceShareOf(s),
      tarif: s.outcome?.tarif,
      premiumPerMonth: s.outcome?.premiumPerMonth,
      humanTotal: s.timeModel?.humanEquivalentTotalReadable,
      concern: last.concern || s.stoppedAt?.detail,
      thoughts: last.thoughts,
      mood: moodOf(s).label,
      moodValence: moodOf(s).valence,
      moodSummary: moodOf(s).summary,
    };
  });
}

function buildDropNarrative({ dropped, dropReasons, dropByPage, reasonBySegment, priceStats }) {
  if (!dropped.length) return ["No in-scope drop-offs in this run."];
  const out = [];
  const top = dropReasons[0];
  out.push(`${dropped.length} people left the online funnel. The single biggest driver was "${top.label}" (${top.count}/${dropped.length}, ${top.pct}%).`);
  const topStep = Object.entries(dropByPage).sort((a, b) => b[1] - a[1])[0];
  if (topStep) out.push(`Most of them leave at "${topStep[0]}" (${topStep[1]} of ${dropped.length}).`);
  if (priceStats.count) {
    const band = priceStats.topPriceBand ? `, concentrated in the ${priceStats.topPriceBand} income band` : "";
    const share = priceStats.avgPriceShare != null ? ` The monthly premium they faced averaged ${priceStats.avgPriceShare}% of their income` : "";
    out.push(`${priceStats.count} left primarily over money${band}.${share} — the price reads as "too high" relative to what they earn.`);
  }
  const segLines = Object.entries(reasonBySegment)
    .filter(([, v]) => v.top && v.top.key !== "count")
    .map(([seg, v]) => `${seg} → mostly "${reasonLabel(v.top.key)}" (${v.top.count}/${v.total})`);
  if (segLines.length) out.push(`By segment: ${segLines.join("; ")}.`);
  return out;
}

function buildPurchaseNarrative({ purchased, bySegment, tarifs }) {
  if (!purchased.length) return ["No online purchases in this run."];
  const out = [];
  out.push(`${purchased.length} people completed the online purchase (${pct(purchased.length, purchased.length)}% of purchasers — 100% of this cohort).`);
  const topTarif = Object.entries(tarifs).sort((a, b) => b[1] - a[1])[0];
  if (topTarif) out.push(`Most chose tariff "${topTarif[0]}" (${topTarif[1]}/${purchased.length}).`);
  const segLines = Object.entries(bySegment)
    .filter(([, v]) => v > 0)
    .map(([seg, v]) => `${seg}: ${v} purchased`);
  if (segLines.length) out.push(`By segment: ${segLines.join("; ")}.`);
  return out;
}

function loadSessions(runDir) {
  const sessDir = join(runDir, "sessions");
  if (!existsSync(sessDir)) throw new Error(`No sessions folder: ${sessDir}`);
  return readdirSync(sessDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const s = JSON.parse(readFileSync(join(sessDir, f), "utf8"));
      s.fileId = f.replace(/\.json$/, "");
      return s;
    });
}

function main() {
  const runDir = join(TEST_RESULTS_DIR, RUN_ID);
  const sessions = loadSessions(runDir);
  const purchased = sessions.filter((s) => s.status === "completed_online");
  const dropped = sessions.filter((s) => s.status === "dropped");
  const outOfScope = sessions.filter((s) => s.status === "out_of_scope");
  const inScope = sessions.length - outOfScope.length;

  const dropByStep = {};
  dropped.forEach((s) => { dropByStep[s.stoppedAt?.step] = (dropByStep[s.stoppedAt?.step] || 0) + 1; });
  const dropByPage = Object.fromEntries(Object.entries(dropByStep).map(([st, n]) => [`${st}_${PAGE_BY_STEP[st]?.name || st}`, n]));

  const byReasonCode = {};
  dropped.forEach((s) => { const c = reasonOf(s); byReasonCode[c] = (byReasonCode[c] || 0) + 1; });
  const dropReasons = Object.entries(byReasonCode)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, label: reasonLabel(code), count, pct: pct(count, dropped.length) }));

  const reasonByIncomeBand = crossTabReasons(dropped, (s) => incomeBand(s.profile?.demographics?.income_monthly_eur));
  const reasonByAgeBand = crossTabReasons(dropped, (s) => ageBand(s.persona?.age));
  const reasonBySegment = crossTabReasons(dropped, (s) => s.persona?.segment || "?");

  const priceDrops = dropped.filter((s) => PRICE_REASONS.has(reasonOf(s)));
  const shareVals = priceDrops.map(priceShareOf).filter((v) => typeof v === "number");
  const avgPriceShare = shareVals.length ? avgFloat(shareVals) : null;
  const priceDropsByIncome = {};
  priceDrops.forEach((s) => {
    const b = incomeBand(s.profile?.demographics?.income_monthly_eur);
    priceDropsByIncome[b] = (priceDropsByIncome[b] || 0) + 1;
  });
  const topPriceBand = Object.entries(priceDropsByIncome).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const purchasedProfile = cohortProfile(purchased);
  const droppedProfile = cohortProfile(dropped);

  const perSegment = {};
  PERSONAS.forEach((p) => {
    const subset = sessions.filter((s) => s.persona?.segmentId === p.segmentId);
    const oos = subset.filter((s) => s.status === "out_of_scope").length;
    const comp = subset.filter((s) => s.status === "completed_online").length;
    const drop = subset.filter((s) => s.status === "dropped").length;
    perSegment[p.segmentId] = {
      persona: p.name,
      segment: subset[0]?.persona?.segment || p.segmentId,
      total: subset.length,
      purchased: comp,
      dropped: drop,
      outOfScope: oos,
      inScopeConversionPct: pct(comp, subset.length - oos),
    };
  });

  const oosByReason = {};
  Object.keys(OUT_OF_SCOPE_REASONS).forEach((r) => { oosByReason[r] = 0; });
  outOfScope.forEach((s) => { if (s.stoppedAt?.reason in oosByReason) oosByReason[s.stoppedAt.reason] += 1; });

  const summary = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    engine: "live_ui_playwright",
    runMode: sessions[0]?.runMode || "live_ui",
    params: {
      personas: sessions.length,
      model: sessions[0]?.model,
      speedup: sessions[0]?.timeModel?.speedup,
      url: sessions[0]?.url,
    },
    note:
      "Live UI run: real browser interactions and UI telemetry. Human-equivalent time is reconstructed " +
      "from each persona's per-page reading estimate (1x); recorded UI time reflects the compressed run speed.",
    totals: {
      personas: sessions.length,
      purchasedOnline: purchased.length,
      droppedInScope: dropped.length,
      outOfScope: outOfScope.length,
      inScope,
    },
    conversion: {
      inScopeConversionPct: pct(purchased.length, inScope),
      rawConversionPct: pct(purchased.length, sessions.length),
      benchmarkPct: (PERSONAS_JSON.shared_context?.current_online_conversion_baseline?.rate ?? 0.056) * 100,
    },
    purchased: {
      narrative: buildPurchaseNarrative({
        purchased,
        bySegment: purchasedProfile?.bySegment || {},
        tarifs: purchasedProfile?.tarifChoices || {},
      }),
      profile: purchasedProfile,
      examples: examples(purchased, 10),
    },
    dropped: {
      narrative: buildDropNarrative({ dropped, dropReasons, dropByPage, reasonBySegment, priceStats: { count: priceDrops.length, avgPriceShare, topPriceBand } }),
      funnelExitByPage: dropByPage,
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
      profile: droppedProfile,
      examples: examples(dropped, 15),
    },
    outOfScope: {
      total: outOfScope.length,
      byReason: Object.fromEntries(Object.entries(oosByReason).map(([k, v]) => [k, { count: v, label: OUT_OF_SCOPE_REASONS[k] }])),
    },
    comparison: {
      purchasedVsDropped: {
        avgAge: { purchased: purchasedProfile?.avgAge, dropped: droppedProfile?.avgAge },
        avgIncomeEur: { purchased: purchasedProfile?.avgIncomeEur, dropped: droppedProfile?.avgIncomeEur },
        avgPremiumEur: { purchased: purchasedProfile?.avgPremiumEur, dropped: droppedProfile?.avgPremiumEur },
        avgHumanSessionTime: {
          purchased: purchasedProfile?.behavioral?.avgHumanTotalReadable,
          dropped: droppedProfile?.behavioral?.avgHumanTotalReadable,
        },
        avgUiClicks: {
          purchased: purchasedProfile?.behavioral?.avgButtonClicks,
          dropped: droppedProfile?.behavioral?.avgButtonClicks,
        },
        avgCursorMoves: {
          purchased: purchasedProfile?.behavioral?.avgCursorMoves,
          dropped: droppedProfile?.behavioral?.avgCursorMoves,
        },
      },
    },
    behavioralStats: {
      overall: behavioralFor(sessions),
      purchased: behavioralFor(purchased),
      dropped: behavioralFor(dropped),
      bySegment: Object.fromEntries(
        PERSONAS.map((p) => {
          const subset = sessions.filter((s) => s.persona?.segmentId === p.segmentId);
          const stats = behavioralFor(subset);
          return stats ? [p.segmentId, { persona: p.name, ...stats }] : null;
        }).filter(Boolean),
      ),
    },
    perSegment,
    mood: {
      note: "End-of-session mood inferred from persona thoughts, drop reason, time on page, back navigation, and price vs income.",
      overall: moodStats(sessions),
      purchased: moodStats(purchased),
      dropped: moodStats(dropped),
      outOfScope: moodStats(outOfScope),
      byIncomeBand: moodByBand(sessions, (s) => incomeBand(s.profile?.demographics?.income_monthly_eur)),
      byAgeBand: moodByBand(sessions, (s) => ageBand(s.persona?.age)),
      bySegment: moodByBand(sessions, (s) => s.persona?.segment || "?"),
      byDropReason: crossTab(dropped, (s) => reasonOf(s), (s) => moodOf(s).label),
    },
  };

  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2));

  const header = ["file", "name", "gender", "age", "income", "segment", "action", "status", "lastStep", "lastPage", "reason", "dropReasonCode", "priceShareOfIncomePct", "tarif", "premium", "humanTime", "uiRecordedTime", "buttonClicks", "backPresses", "hovers", "cursorMoves", "mood", "moodValence", "moodSummary", "concern"];
  const rows = sessions.map((s) => {
    const last = s.walk?.[s.walk.length - 1] || {};
    const tm = s.telemetry || {};
    const sum = tm.summary || {};
    const m = moodOf(s);
    const action = s.status === "completed_online" ? "purchased" : s.status === "out_of_scope" ? "stopped" : "left";
    const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\s+/g, " ").trim()}"`;
    return [
      s.fileId, s.persona?.name, s.persona?.gender, s.persona?.age, s.profile?.demographics?.income_monthly_eur ?? "",
      s.persona?.segment, action, s.status, s.stoppedAt?.step ?? RESULT_STEP, s.stoppedAt?.page ?? "Ergebnis",
      s.stoppedAt?.detail ?? "", reasonOf(s), priceShareOf(s) ?? "",
      s.outcome?.tarif ?? "", s.outcome?.premiumPerMonth ?? "",
      s.timeModel?.humanEquivalentTotalReadable ?? "", msToReadable(tm.totalDurationMs || 0),
      sum.totalButtonClicks ?? "", sum.backPresses ?? "", sum.hovers ?? "", sum.cursorMoves ?? "",
      m.label, m.valence, m.summary,
      last.concern || s.stoppedAt?.detail || "",
    ].map(csvCell).join(",");
  });
  writeFileSync(join(runDir, "index.csv"), [header.map((h) => `"${h}"`).join(","), ...rows].join("\n"));

  // ---- terminal -----------------------------------------------------------
  console.log(`\n▶ Summary for "${RUN_ID}" (${sessions.length} sessions)\n`);
  console.log(`  purchased : ${purchased.length}  (${summary.conversion.inScopeConversionPct}% in-scope · benchmark ${summary.conversion.benchmarkPct}%)`);
  console.log(`  dropped   : ${dropped.length}`);
  console.log(`  out-scope : ${outOfScope.length}\n`);

  if (purchased.length) {
    console.log(`  ── purchased (${purchased.length}) ─────────────────────`);
    summary.purchased.narrative.forEach((l) => console.log(`  • ${l}`));
    console.log(`  avg income €${purchasedProfile.avgIncomeEur} · avg premium €${purchasedProfile.avgPremiumEur} · avg session ${purchasedProfile.behavioral?.avgHumanTotalReadable}`);
    console.log(`  tariffs: ${JSON.stringify(purchasedProfile.tarifChoices)}`);
  }

  if (dropped.length) {
    console.log(`\n  ── dropped (${dropped.length}) ─────────────────────────`);
    summary.dropped.narrative.forEach((l) => console.log(`  • ${l}`));
    console.log(`\n  top reasons:`);
    dropReasons.slice(0, 6).forEach((r) => console.log(`    ${String(r.count).padStart(3)} (${String(r.pct).padStart(4)}%)  ${r.label}`));
    console.log(`\n  exit pages: ${JSON.stringify(dropByPage)}`);
    if (priceDrops.length) {
      console.log(`  affordability: ${priceDrops.length} price-related · avg ${avgPriceShare}% of income · most ${topPriceBand || "—"}`);
    }
  }

  console.log(`\n  ── comparison (purchased vs dropped avg) ───`);
  const c = summary.comparison.purchasedVsDropped;
  console.log(`  age        ${c.avgAge.purchased} vs ${c.avgAge.dropped}`);
  console.log(`  income €   ${c.avgIncomeEur.purchased} vs ${c.avgIncomeEur.dropped}`);
  console.log(`  premium €  ${c.avgPremiumEur.purchased} vs ${c.avgPremiumEur.dropped}`);
  console.log(`  human time ${c.avgHumanSessionTime.purchased} vs ${c.avgHumanSessionTime.dropped}`);
  console.log(`  UI clicks  ${c.avgUiClicks.purchased} vs ${c.avgUiClicks.dropped}`);

  const mood = summary.mood;
  if (mood?.overall) {
    console.log(`\n  ── end mood (all ${mood.overall.count}) ────────────────`);
    console.log(`  avg valence ${mood.overall.avgValence} · intensity ${mood.overall.avgIntensity}`);
    Object.entries(mood.overall.byLabel).slice(0, 6).forEach(([label, n]) => {
      console.log(`    ${String(n).padStart(3)} (${String(pct(n, mood.overall.count)).padStart(4)}%)  ${label}`);
    });
    if (mood.purchased?.count) {
      const topP = Object.entries(mood.purchased.byLabel).sort((a, b) => b[1] - a[1])[0];
      console.log(`  purchased → mostly "${topP?.[0] || "—"}" (${topP?.[1] || 0}/${mood.purchased.count})`);
    }
    if (mood.dropped?.count) {
      const topD = Object.entries(mood.dropped.byLabel).sort((a, b) => b[1] - a[1])[0];
      console.log(`  dropped   → mostly "${topD?.[0] || "—"}" (${topD?.[1] || 0}/${mood.dropped.count})`);
    }
  }

  console.log(`\n  ✓ wrote summary.json + index.csv → ${runDir}\n`);
}

main();

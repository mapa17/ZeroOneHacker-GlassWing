#!/usr/bin/env node
// Deep pattern mining across a live run batch.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMood } from "../src/logic/moodAnalysis.js";
import { DROP_REASON_CODES } from "../src/logic/funnelPages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RUN = process.argv.includes("--run") ? process.argv[process.argv.indexOf("--run") + 1] : "live400";
const runDir = join(ROOT, "test-results", RUN, "sessions");

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const incomeBand = (eur) => {
  const n = Number(eur) || 0;
  if (n < 1500) return "<€1.500";
  if (n < 2500) return "€1.500–2.499";
  if (n < 3500) return "€2.500–3.499";
  if (n < 4500) return "€3.500–4.499";
  return "€4.500+";
};

const sessions = readdirSync(runDir).filter((f) => f.endsWith(".json")).map((f) => {
  const s = JSON.parse(readFileSync(join(runDir, f), "utf8"));
  s._file = f;
  s._purchased = s.status === "completed_online";
  s._income = s.profile?.demographics?.income_monthly_eur ?? null;
  s._incomeBand = incomeBand(s._income);
  s._humanMs = s.timeModel?.humanEquivalentTotalMs ?? 0;
  s._mood = s.mood || analyzeMood(s);
  s._reason = s.stoppedAt?.reasonCode || s.walk?.at(-1)?.dropReasonCode || "other";
  s._step = s.stoppedAt?.step ?? 8;
  s._clicks = s.telemetry?.summary?.totalButtonClicks ?? 0;
  s._back = s.telemetry?.summary?.backPresses ?? 0;
  s._cursor = s.telemetry?.summary?.cursorMoves ?? 0;
  s._hovers = s.telemetry?.summary?.hovers ?? 0;
  s._fields = s.telemetry?.summary?.fieldsInteracted ?? 0;
  s._premium = s.outcome?.premiumPerMonth ?? null;
  s._share = (() => {
    if (typeof s.stoppedAt?.priceShareOfIncomePct === "number") return s.stoppedAt.priceShareOfIncomePct;
    for (let i = (s.walk || []).length - 1; i >= 0; i--) {
      if (typeof s.walk[i].priceShareOfIncomePct === "number") return s.walk[i].priceShareOfIncomePct;
    }
    return s._income && s._premium ? Math.round((s._premium / s._income) * 1000) / 10 : null;
  })();
  s._insuranceSpend = s.profile?.insurance_behavior?.monthly_insurance_spend_eur ?? null;
  s._lastThoughts = s.walk?.at(-1)?.thoughts || "";
  s._lastConcern = s.walk?.at(-1)?.concern || s.stoppedAt?.detail || "";
  s._tarifStepMs = s.timeModel?.perStep?.find((p) => p.step === 3)?.humanEquivalentMs ?? null;
  return s;
});

const purchased = sessions.filter((s) => s._purchased);
const dropped = sessions.filter((s) => !s._purchased);

function convBy(filterFn, label) {
  const groups = {};
  sessions.forEach((s) => {
    const k = filterFn(s);
    groups[k] = groups[k] || { total: 0, purchased: 0, dropped: 0, humanMs: [], incomes: [], moods: {} };
    groups[k].total++;
    groups[k][s._purchased ? "purchased" : "dropped"]++;
    groups[k].humanMs.push(s._humanMs);
    if (s._income) groups[k].incomes.push(s._income);
    groups[k].moods[s._mood.label] = (groups[k].moods[s._mood.label] || 0) + 1;
  });
  return Object.entries(groups)
    .map(([k, v]) => ({
      key: k,
      label,
      total: v.total,
      purchased: v.purchased,
      conversionPct: pct(v.purchased, v.total),
      avgHumanMin: Math.round(avg(v.humanMs) / 600) / 100,
      medianHumanMin: Math.round(median(v.humanMs) / 600) / 100,
      avgIncome: Math.round(avg(v.incomes)),
      topMood: Object.entries(v.moods).sort((a, b) => b[1] - a[1])[0],
    }))
    .sort((a, b) => b.total - a.total);
}

// Time quartiles
const sortedByTime = [...sessions].sort((a, b) => a._humanMs - b._humanMs);
const q = (p) => sortedByTime[Math.floor(p * (sortedByTime.length - 1))]._humanMs;
const q25 = q(0.25), q50 = q(0.5), q75 = q(0.75);

function bucketTime(ms) {
  if (ms <= q25) return "fastest 25%";
  if (ms <= q50) return "25–50%";
  if (ms <= q75) return "50–75%";
  return "slowest 25%";
}

const timeBuckets = {};
sessions.forEach((s) => {
  const b = bucketTime(s._humanMs);
  timeBuckets[b] = timeBuckets[b] || { total: 0, purchased: 0, moods: {}, reasons: {}, examples: [] };
  timeBuckets[b].total++;
  if (s._purchased) timeBuckets[b].purchased++;
  timeBuckets[b].moods[s._mood.label] = (timeBuckets[b].moods[s._mood.label] || 0) + 1;
  if (!s._purchased) timeBuckets[b].reasons[s._reason] = (timeBuckets[b].reasons[s._reason] || 0) + 1;
  if (!s._purchased && timeBuckets[b].examples.length < 3) {
    timeBuckets[b].examples.push({
      name: s.persona?.name,
      income: s._income,
      humanMin: Math.round(s._humanMs / 600) / 100,
      mood: s._mood.label,
      reason: DROP_REASON_CODES[s._reason] || s._reason,
      concern: s._lastConcern.slice(0, 120),
    });
  }
});

// Long sessions that dropped vs purchased at step 6
const longDropped = dropped.filter((s) => s._humanMs >= q75).slice(0, 5);
const longPurchased = purchased.filter((s) => s._humanMs >= q75).slice(0, 3);

// Tariff page dwell vs outcome
const tarifLong = sessions.filter((s) => s._tarifStepMs >= 90000);
const tarifShort = sessions.filter((s) => s._tarifStepMs != null && s._tarifStepMs < 45000);

// Patterns array
const patterns = [];

// P1: Time vs conversion
Object.entries(timeBuckets).forEach(([b, v]) => {
  patterns.push({
    id: `time_${b}`,
    strength: Math.abs(v.purchased / v.total - 0.078) * v.total,
    title: `${b} time → ${pct(v.purchased, v.total)}% purchase rate (${v.purchased}/${v.total})`,
    detail: `Avg moods: ${Object.entries(v.moods).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, n]) => `${m} ${n}`).join(", ")}`,
    examples: v.examples,
  });
});

// P: Income band conversion
convBy((s) => s._incomeBand, "income").forEach((g) => {
  patterns.push({
    id: `income_${g.key}`,
    strength: Math.abs(g.conversionPct - 7.8) * g.total + (7.8 - g.conversionPct) * 2,
    title: `Income ${g.key}: ${g.conversionPct}% convert (avg income €${g.avgIncome}, avg ${g.avgHumanMin} min)`,
    detail: `Top mood among leavers: ${g.topMood?.[0]} (${g.topMood?.[1]}/${g.total - g.purchased || g.total})`,
  });
});

// P: Mood vs conversion (among dropped)
const moodGroups = {};
sessions.forEach((s) => {
  const m = s._mood.label;
  moodGroups[m] = moodGroups[m] || { total: 0, purchased: 0, avgHuman: [], avgIncome: [], topReasons: {} };
  moodGroups[m].total++;
  if (s._purchased) moodGroups[m].purchased++;
  moodGroups[m].avgHuman.push(s._humanMs);
  if (s._income) moodGroups[m].avgIncome.push(s._income);
  if (!s._purchased) moodGroups[m].topReasons[s._reason] = (moodGroups[m].topReasons[s._reason] || 0) + 1;
});
Object.entries(moodGroups).forEach(([m, v]) => {
  const topR = Object.entries(v.topReasons).sort((a, b) => b[1] - a[1])[0];
  patterns.push({
    id: `mood_${m}`,
    strength: v.total * (m === "disappointed" || m === "overwhelmed" ? 1.5 : 1),
    title: `Mood "${m}": ${v.total} people, ${pct(v.purchased, v.total)}% purchased, avg ${Math.round(avg(v.avgHuman) / 600) / 100} min`,
    detail: topR ? `When they leave: mostly ${DROP_REASON_CODES[topR[0]] || topR[0]} (${topR[1]})` : "Mostly completers",
  });
});

// P: Drop reason + income cross
const reasonIncome = {};
dropped.forEach((s) => {
  const k = s._reason;
  reasonIncome[k] = reasonIncome[k] || { count: 0, incomes: [], humanMs: [], moods: {} };
  reasonIncome[k].count++;
  if (s._income) reasonIncome[k].incomes.push(s._income);
  reasonIncome[k].humanMs.push(s._humanMs);
  reasonIncome[k].moods[s._mood.label] = (reasonIncome[k].moods[s._mood.label] || 0) + 1;
});
Object.entries(reasonIncome).sort((a, b) => b[1].count - a[1].count).slice(0, 8).forEach(([r, v]) => {
  patterns.push({
    id: `reason_${r}`,
    strength: v.count * 1.2,
    title: `${DROP_REASON_CODES[r] || r}: ${v.count} drops, avg income €${Math.round(avg(v.incomes))}, avg ${Math.round(avg(v.humanMs) / 600) / 100} min`,
    detail: `Mood mix: ${Object.entries(v.moods).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m, n]) => `${m} ${n}`).join(", ")}`,
  });
});

// P: Tariff page long dwell
patterns.push({
  id: "tarif_long_dwell",
  strength: tarifLong.length,
  title: `90+ sec on tariff page: ${pct(tarifLong.filter((s) => s._purchased).length, tarifLong.length)}% convert (${tarifLong.filter((s) => s._purchased).length}/${tarifLong.length})`,
  detail: `vs 45s fast: ${pct(tarifShort.filter((s) => s._purchased).length, tarifShort.length)}% (${tarifShort.filter((s) => s._purchased).length}/${tarifShort.length})`,
});

// P: Segment
convBy((s) => s.persona?.segment || "?", "segment").forEach((g) => {
  patterns.push({
    id: `seg_${g.key}`,
    strength: g.total * Math.abs(g.conversionPct - 7.8) / 5 + g.total * 0.3,
    title: `${g.key}: ${g.conversionPct}% convert (${g.purchased}/${g.total}), avg ${g.avgHumanMin} min`,
    detail: `Avg income €${g.avgIncome}`,
  });
});

// P: Age
const ageBand = (a) => (a < 30 ? "18–29" : a < 45 ? "30–44" : a < 60 ? "45–59" : "60+");
convBy((s) => ageBand(s.persona?.age || 0), "age").forEach((g) => {
  patterns.push({
    id: `age_${g.key}`,
    strength: g.total * 0.4,
    title: `Age ${g.key}: ${g.conversionPct}% convert, avg session ${g.avgHumanMin} min`,
  });
});

// P: Price share thresholds
[2, 3, 4, 5].forEach((thr) => {
  const sub = sessions.filter((s) => s._share != null && s._share >= thr);
  if (sub.length < 5) return;
  patterns.push({
    id: `share_${thr}`,
    strength: sub.length * (7.8 - pct(sub.filter((s) => s._purchased).length, sub.length)),
    title: `Premium ≥${thr}% of income: ${pct(sub.filter((s) => s._purchased).length, sub.length)}% convert (${sub.filter((s) => s._purchased).length}/${sub.length})`,
    detail: `Avg mood: ${Object.entries(sub.reduce((o, s) => { o[s._mood.label] = (o[s._mood.label] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]}`,
  });
});

// P: Insurance spend ratio
const highInsRatio = sessions.filter((s) => s._income && s._insuranceSpend && s._insuranceSpend / s._income > 0.08);
patterns.push({
  id: "high_ins_spend",
  strength: highInsRatio.length * 0.8,
  title: `Already spending >8% of income on insurance: ${pct(highInsRatio.filter((s) => s._purchased).length, highInsRatio.length)}% convert (${highInsRatio.filter((s) => s._purchased).length}/${highInsRatio.length})`,
});

// P: Step 3 exit dominant
const step3 = dropped.filter((s) => s._step === 3);
patterns.push({
  id: "step3_wall",
  strength: step3.length * 1.5,
  title: `215/369 drops at tariff step — avg ${Math.round(avg(step3.map((s) => s._humanMs)) / 600) / 100} min total session`,
  detail: `Top reasons: advisory_wall ${step3.filter((s) => s._reason === "advisory_wall").length}, want_to_compare ${step3.filter((s) => s._reason === "want_to_compare").length}`,
});

// P: Step 6 long + anxious
const step6 = dropped.filter((s) => s._step === 6);
patterns.push({
  id: "step6_commitment",
  strength: step6.length,
  title: `66 drops at health/commitment step — mood: anxious ${step6.filter((s) => s._mood.label === "anxious").length}, disappointed ${step6.filter((s) => s._mood.label === "disappointed").length}`,
  detail: `Avg ${Math.round(avg(step6.map((s) => s._humanMs)) / 600) / 100} min session (longest-finishers)`,
});

// P: Purchasers faster?
patterns.push({
  id: "purchased_faster",
  strength: 50,
  title: `Purchasers avg ${Math.round(avg(purchased.map((s) => s._humanMs)) / 600) / 100} min vs droppers ${Math.round(avg(dropped.map((s) => s._humanMs)) / 600) / 100} min`,
  detail: `Median: ${Math.round(median(purchased.map((s) => s._humanMs)) / 600) / 100} vs ${Math.round(median(dropped.map((s) => s._humanMs)) / 600) / 100} min`,
});

// P: Cursor/engagement
const highCursor = sessions.filter((s) => s._cursor >= 25);
patterns.push({
  id: "high_cursor",
  strength: 30,
  title: `High cursor activity (25+ moves): ${pct(highCursor.filter((s) => s._purchased).length, highCursor.length)}% convert`,
  detail: `Low cursor (<10): ${pct(sessions.filter((s) => s._cursor < 10 && s._purchased).length, sessions.filter((s) => s._cursor < 10).length)}%`,
});

patterns.sort((a, b) => b.strength - a.strength);
const top20 = patterns.slice(0, 20);

const report = {
  run: RUN,
  n: sessions.length,
  purchased: purchased.length,
  conversionPct: pct(purchased.length, sessions.length),
  timeQuartilesMin: { q25: Math.round(q25 / 600) / 100, q50: Math.round(q50 / 600) / 100, q75: Math.round(q75 / 600) / 100 },
  timeBuckets: Object.fromEntries(Object.entries(timeBuckets).map(([k, v]) => [k, {
    total: v.total,
    purchased: v.purchased,
    conversionPct: pct(v.purchased, v.total),
    topMoods: Object.entries(v.moods).sort((a, b) => b[1] - a[1]).slice(0, 4),
    topDropReasons: Object.entries(v.reasons).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => ({ code: c, label: DROP_REASON_CODES[c], count: n })),
    examples: v.examples,
  }])),
  incomeConversion: convBy((s) => s._incomeBand, "income"),
  segmentConversion: convBy((s) => s.persona?.segment, "segment"),
  moodBreakdown: moodGroups,
  top20Patterns: top20,
  longDroppedExamples: longDropped.map((s) => ({
    name: s.persona?.name,
    income: s._income,
    segment: s.persona?.segment,
    humanMin: Math.round(s._humanMs / 600) / 100,
    step: s._step,
    mood: s._mood.label,
    reason: DROP_REASON_CODES[s._reason],
    concern: s._lastConcern,
    thoughts: s._lastThoughts,
  })),
  longPurchasedExamples: longPurchased.map((s) => ({
    name: s.persona?.name,
    income: s._income,
    humanMin: Math.round(s._humanMs / 600) / 100,
    mood: s._mood.label,
    thoughts: s._lastThoughts,
  })),
};

const outPath = join(ROOT, "test-results", RUN, "pattern-analysis.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

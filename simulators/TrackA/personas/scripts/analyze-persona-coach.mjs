#!/usr/bin/env node
/**
 * Persona profile → web behavior → outcome patterns for coach prediction.
 * Usage: node scripts/analyze-persona-coach.mjs --run live400
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

function incomeBand(eur) {
  const n = Number(eur) || 0;
  if (n < 1500) return "<€1.500";
  if (n < 2500) return "€1.500–2.499";
  if (n < 3500) return "€2.500–3.499";
  if (n < 4500) return "€3.500–4.499";
  return "€4.500+";
}

function bucketSwitch(n) {
  const v = Number(n) || 0;
  if (v < 10) return "low_switch (<10)";
  if (v < 20) return "mid_switch (10–19)";
  return "high_switch (20+)";
}

function onlineScore(profile) {
  const cp = profile?.channel_preferences || {};
  const steps = Object.values(cp);
  const online = steps.filter((v) => v === "self_online").length;
  return steps.length ? online / steps.length : 0;
}

function extractFeatures(s) {
  const p = s.profile || {};
  const d = p.demographics || {};
  const ib = p.insurance_behavior || {};
  const income = d.income_monthly_eur ?? null;
  const spend = ib.monthly_insurance_spend_eur ?? null;
  return {
    segmentId: p.persona_id,
    segment: p.segment_name,
    archetype: p.archetype_name,
    age: d.age,
    ageBand: d.age < 30 ? "18–29" : d.age < 45 ? "30–44" : d.age < 60 ? "45–59" : "60+",
    gender: d.gender,
    income,
    incomeBand: incomeBand(income),
    incomeLabel: d.income_label,
    education: d.education,
    advisorType: ib.advisor_type || "unknown",
    switchWillingness: ib.switch_willingness,
    switchBucket: bucketSwitch(ib.switch_willingness),
    hasHealthInsurance: ib.has_health_insurance === true,
    insuranceSpend: spend,
    insuranceShareOfIncome: income && spend ? spend / income : null,
    insuranceShareBucket:
      income && spend ? (spend / income > 0.08 ? "heavy_insurer (>8%)" : spend / income > 0.05 ? "moderate (5–8%)" : "light (<5%)") : "unknown",
    productsOwned: ib.products_owned_count ?? ib.owned_products?.length ?? 0,
    onlineChannelScore: onlineScore(p),
    purchaseChannel: p.channel_preferences?.purchase || "unknown",
    consultationChannel: p.channel_preferences?.consultation || "unknown",
    everBoughtOnline: (p.online_behavior || []).includes("ever_purchased_insurance_online"),
    portalActive: (p.online_behavior || []).includes("customer_portal_active_last_12_months"),
    drivers: p.top_decision_drivers || [],
    criteria: p.top_purchase_criteria || [],
    hasDriver: (k) => (p.top_decision_drivers || []).includes(k),
    hasCriterion: (k) => (p.top_purchase_criteria || []).includes(k),
  };
}

function extractOutcome(s) {
  const m = s.mood || analyzeMood(s);
  return {
    purchased: s.status === "completed_online",
    status: s.status,
    exitStep: s.stoppedAt?.step ?? 8,
    exitPage: s.stoppedAt?.page ?? "Ergebnis",
    reasonCode: s.stoppedAt?.reasonCode || s.walk?.at(-1)?.dropReasonCode || "other",
    reasonLabel: DROP_REASON_CODES[s.stoppedAt?.reasonCode] || s.stoppedAt?.reasonCode,
    tarif: s.outcome?.tarif || s.selections?.tarif || null,
    premium: s.outcome?.premiumPerMonth,
    mood: m.label,
    moodValence: m.valence,
  };
}

function extractBehavior(s) {
  const tel = s.telemetry?.summary || {};
  const tarifMs = s.timeModel?.perStep?.find((x) => x.step === 3)?.humanEquivalentMs;
  return {
    humanMin: Math.round((s.timeModel?.humanEquivalentTotalMs || 0) / 600) / 100,
    tarifMin: tarifMs ? Math.round(tarifMs / 600) / 100 : null,
    clicks: tel.totalButtonClicks ?? 0,
    backPresses: tel.backPresses ?? 0,
    cursorMoves: tel.cursorMoves ?? 0,
    fields: tel.fieldsInteracted ?? 0,
    hovers: tel.hovers ?? 0,
    reachedTarif: (s.walk || []).some((w) => w.step === 3),
    reachedStep6: (s.walk || []).some((w) => w.step === 6),
    behaviorClass:
      (s.timeModel?.humanEquivalentTotalMs || 0) < 72000
        ? "fast_bounce"
        : (s.timeModel?.humanEquivalentTotalMs || 0) < 108000
          ? "medium_compare"
          : "slow_deep",
  };
}

const sessions = readdirSync(sessDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => {
    const raw = JSON.parse(readFileSync(join(sessDir, f), "utf8"));
    return { raw, f, feat: extractFeatures(raw), out: extractOutcome(raw), beh: extractBehavior(raw) };
  });

function cohort(filterFn, label) {
  const rows = sessions.filter(filterFn);
  if (rows.length < 8) return null;
  const purchased = rows.filter((r) => r.out.purchased);
  const dropped = rows.filter((r) => !r.out.purchased);
  const reasons = {};
  const moods = {};
  const tarifs = {};
  const exitSteps = {};
  dropped.forEach((r) => {
    reasons[r.out.reasonCode] = (reasons[r.out.reasonCode] || 0) + 1;
    moods[r.out.mood] = (moods[r.out.mood] || 0) + 1;
    exitSteps[r.out.exitStep] = (exitSteps[r.out.exitStep] || 0) + 1;
  });
  purchased.forEach((r) => {
    if (r.out.tarif) tarifs[r.out.tarif] = (tarifs[r.out.tarif] || 0) + 1;
  });
  const topReason = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  const topMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0];
  const topTarif = Object.entries(tarifs).sort((a, b) => b[1] - a[1])[0];
  const topExit = Object.entries(exitSteps).sort((a, b) => b[1] - a[1])[0];

  return {
    label,
    n: rows.length,
    conversionPct: pct(purchased.length, rows.length),
    purchased: purchased.length,
    avgAge: Math.round(avg(rows.map((r) => r.feat.age))),
    avgIncome: Math.round(avg(rows.map((r) => r.feat.income).filter(Boolean))),
    behavior: {
      avgHumanMin: Math.round(avg(rows.map((r) => r.beh.humanMin)) * 100) / 100,
      avgTarifMin: Math.round(avg(rows.map((r) => r.beh.tarifMin).filter((v) => v != null)) * 100) / 100,
      avgClicks: Math.round(avg(rows.map((r) => r.beh.clicks))),
      avgBack: Math.round(avg(rows.map((r) => r.beh.backPresses)) * 10) / 10,
      avgCursor: Math.round(avg(rows.map((r) => r.beh.cursorMoves))),
      fastBouncePct: pct(rows.filter((r) => r.beh.behaviorClass === "fast_bounce").length, rows.length),
      slowDeepPct: pct(rows.filter((r) => r.beh.behaviorClass === "slow_deep").length, rows.length),
      reachStep6Pct: pct(rows.filter((r) => r.beh.reachedStep6).length, rows.length),
    },
    outcome: {
      topDropReason: topReason ? { code: topReason[0], label: DROP_REASON_CODES[topReason[0]], count: topReason[1], pct: pct(topReason[1], dropped.length) } : null,
      topMood: topMood ? { label: topMood[0], count: topMood[1] } : null,
      topPurchasedTarif: topTarif ? { tarif: topTarif[0], count: topTarif[1] } : null,
      topExitStep: topExit ? { step: Number(topExit[0]), count: topExit[1], pct: pct(topExit[1], dropped.length) } : null,
    },
  };
}

// Build cohorts across profile dimensions
const cohortDefs = [];

// Segments
for (const seg of ["Online Affine", "Rising Hybrids", "Service Affine"]) {
  cohortDefs.push({ fn: (r) => r.feat.segment === seg, label: `Segment: ${seg}` });
}

// Channel purchase preference
for (const ch of ["self_online", "advisor_led", "mixed"]) {
  cohortDefs.push({ fn: (r) => r.feat.purchaseChannel === ch, label: `Purchase channel: ${ch}` });
}

// Advisor type
for (const a of ["no_advisor", "personal_advisor", "bank_advisor"]) {
  cohortDefs.push({ fn: (r) => r.feat.advisorType === a, label: `Advisor: ${a}` });
}

// Income label
for (const il of ["low", "average", "above_average", "high"]) {
  cohortDefs.push({ fn: (r) => r.feat.incomeLabel === il, label: `Income label: ${il}` });
}

// Switch willingness
for (const sb of ["low_switch (<10)", "mid_switch (10–19)", "high_switch (20+)"]) {
  cohortDefs.push({ fn: (r) => r.feat.switchBucket === sb, label: `Switch willingness: ${sb}` });
}

// Insurance load
for (const ib of ["light (<5%)", "moderate (5–8%)", "heavy_insurer (>8%)"]) {
  cohortDefs.push({ fn: (r) => r.feat.insuranceShareBucket === ib, label: `Insurance spend: ${ib}` });
}

// Health insurance gap
cohortDefs.push({ fn: (r) => r.feat.hasHealthInsurance === false, label: "No existing health insurance" });
cohortDefs.push({ fn: (r) => r.feat.hasHealthInsurance === true, label: "Has health insurance" });

// Online behavior flags
cohortDefs.push({ fn: (r) => r.feat.everBoughtOnline, label: "Ever bought insurance online" });
cohortDefs.push({ fn: (r) => !r.feat.everBoughtOnline, label: "Never bought insurance online" });
cohortDefs.push({ fn: (r) => r.feat.onlineChannelScore >= 0.9, label: "Fully digital channel prefs (≥90% online steps)" });
cohortDefs.push({ fn: (r) => r.feat.onlineChannelScore < 0.5, label: "Low digital channel prefs (<50% online)" });

// Decision drivers (individual tags)
const driverTags = [...new Set(sessions.flatMap((r) => r.feat.drivers))];
for (const d of driverTags) {
  cohortDefs.push({ fn: (r) => r.feat.hasDriver(d), label: `Driver: ${d}` });
}

// Purchase criteria
const criteriaTags = [...new Set(sessions.flatMap((r) => r.feat.criteria))];
for (const c of criteriaTags) {
  cohortDefs.push({ fn: (r) => r.feat.hasCriterion(c), label: `Criterion: ${c}` });
}

// Age bands
for (const ab of ["18–29", "30–44", "45–59", "60+"]) {
  cohortDefs.push({ fn: (r) => r.feat.ageBand === ab, label: `Age: ${ab}` });
}

// Archetypes
for (const ar of ["Franz Huber", "Judith Berger", "Peter Wagner"]) {
  cohortDefs.push({ fn: (r) => r.feat.archetype === ar, label: `Archetype: ${ar}` });
}

const cohortResults = cohortDefs.map(({ fn, label }) => cohort(fn, label)).filter(Boolean);

// Composite persona signatures (multi-trait profiles for coach)
const signatures = [
  {
    id: "digital_self_serve_buyer",
    label: "Digital self-serve buyer",
    match: (r) => r.feat.segment === "Online Affine" && r.feat.purchaseChannel === "self_online" && r.feat.everBoughtOnline,
    coachSuggest: "Default Start tariff, minimize steps, show total monthly cost early, no advisor popup unless stuck 90s on tariff",
  },
  {
    id: "hybrid_researcher",
    label: "Hybrid researcher (Rising Hybrid + compares)",
    match: (r) => r.feat.segment === "Rising Hybrids" && r.feat.hasDriver("compares_multiple_offers"),
    coachSuggest: "Side-by-side tariff table, save quote, comparison export, soft advisor CTA at step 3 — not a dead-end",
  },
  {
    id: "service_human_first",
    label: "Service-first (needs human)",
    match: (r) => r.feat.segment === "Service Affine" || r.feat.consultationChannel !== "self_online",
    coachSuggest: "Offer named advisor / callback on step 0–1, simplify to 2 choices, never force full online path",
  },
  {
    id: "budget_constrained",
    label: "Budget-constrained buyer",
    match: (r) => r.feat.incomeBand === "<€1.500" || r.feat.incomeBand === "€1.500–2.499" || r.feat.hasCriterion("insurance_premium"),
    coachSuggest: "Anchor Start tariff, show €/day framing, flag addons as optional, warn before Optimal price jump",
  },
  {
    id: "premium_seeker_blocked",
    label: "Premium seeker blocked by advisory wall",
    match: (r) => (r.feat.incomeBand === "€3.500–4.499" || r.feat.incomeBand === "€4.500+") && r.feat.hasCriterion("price_performance"),
    coachSuggest: "Explain Optimal vs Plus gap in plain language, offer advisory booking AS conversion, show Start as online fallback",
  },
  {
    id: "commitment_anxious_finisher",
    label: "Almost-buyer (reaches step 6, low switch)",
    match: (r) => r.beh.reachedStep6 && r.feat.switchBucket === "low_switch (<10)",
    coachSuggest: "Step 6 reassurance: what happens after click, cooling-off period, human review option, income vs premium bar",
  },
  {
    id: "fast_bouncer",
    label: "Fast bouncer (wrong fit)",
    match: (r) => r.beh.behaviorClass === "fast_bounce" && !r.out.purchased,
    coachSuggest: "Detect <90s + step≤3: offer phone/chat immediately, ask 'online or Beratung?' before they leave",
  },
  {
    id: "heavy_insurance_budget",
    label: "Already over-insured budget",
    match: (r) => r.feat.insuranceShareBucket === "heavy_insurer (>8%)",
    coachSuggest: "Show total insurance spend picture, position KV as replacement not add-on, Start-only path",
  },
];

const signatureResults = signatures.map((sig) => {
  const sub = cohort((r) => sig.match(r), sig.label);
  if (!sub || sub.n < 5) return null;
  const base = cohort(() => true, "all");
  return {
    ...sig,
    ...sub,
    liftVsAvg: Math.round((sub.conversionPct - base.conversionPct) * 10) / 10,
  };
}).filter(Boolean);

// Prediction matrix: profile trait → most likely outcome path
const predictionRules = cohortResults
  .filter((c) => c.n >= 15)
  .sort((a, b) => b.n - a.n)
  .slice(0, 30)
  .map((c) => ({
    profile: c.label,
    n: c.n,
    likelyOutcome: c.conversionPct >= 10 ? "likely_purchase" : c.conversionPct <= 4 ? "likely_drop" : "uncertain",
    conversionPct: c.conversionPct,
    expectedBehavior: `${c.behavior.avgHumanMin} min session · ${c.behavior.avgTarifMin || "?"} min on tariff · ${c.behavior.avgClicks} clicks · step 6 reached ${c.behavior.reachStep6Pct}%`,
    ifDrops: c.outcome.topDropReason
      ? `${c.outcome.topDropReason.label} (${c.outcome.topDropReason.pct}% of drops)`
      : "—",
    ifDropsMood: c.outcome.topMood?.label || "—",
    ifBuys: c.outcome.topPurchasedTarif ? `Tariff "${c.outcome.topPurchasedTarif.tarif}" (${c.outcome.topPurchasedTarif.count}/${c.purchased})` : "—",
    exitStep: c.outcome.topExitStep ? `Step ${c.outcome.topExitStep.step} (${c.outcome.topExitStep.pct}% of drops)` : "—",
  }));

// Top discriminators: highest conversion vs lowest (min n=20)
const eligible = cohortResults.filter((c) => c.n >= 20);
const byConv = [...eligible].sort((a, b) => b.conversionPct - a.conversionPct);
const highConv = byConv.filter((c) => c.conversionPct >= 8).slice(0, 8);
const lowConv = [...eligible].sort((a, b) => a.conversionPct - b.conversionPct).slice(0, 8);

const report = {
  run: RUN,
  n: sessions.length,
  baselineConversionPct: pct(sessions.filter((r) => r.out.purchased).length, sessions.length),
  coachFramework: {
    description:
      "Match incoming user signals (segment, channel prefs, income, drivers) to a persona signature, " +
      "predict behavior + outcome, then show the suggested coach intervention before they drop.",
    steps: [
      "1. Classify profile → persona signature (see signatures[])",
      "2. Predict behavior class (fast_bounce / medium_compare / slow_deep) from segment + channel score",
      "3. Predict exit step + reason from signature history",
      "4. Intervene with coachSuggest + better tariff/options",
    ],
  },
  signatures: signatureResults.sort((a, b) => b.n - a.n),
  highConversionProfiles: highConv,
  lowConversionProfiles: lowConv,
  predictionRules,
  segmentArchetypeMatrix: ["Online Affine", "Rising Hybrids", "Service Affine"].map((seg) =>
    ["Franz Huber", "Judith Berger", "Peter Wagner"].map((arch) => {
      const rows = sessions.filter((r) => r.feat.segment === seg && r.feat.archetype === arch);
      if (rows.length < 3) return null;
      return cohort((r) => r.feat.segment === seg && r.feat.archetype === arch, `${seg} × ${arch}`);
    }).filter(Boolean),
  ).flat(),
};

const out = join(ROOT, "test-results", RUN, "persona-coach-patterns.json");
writeFileSync(out, JSON.stringify(report, null, 2));

// Terminal summary
console.log(`\n▶ Persona → behavior → outcome (${RUN}, n=${sessions.length}, baseline ${report.baselineConversionPct}%)\n`);
console.log("── COACH SIGNATURES (multi-trait profiles) ──");
signatureResults.sort((a, b) => b.n - a.n).forEach((s) => {
  console.log(`\n  ${s.label} (n=${s.n}, ${s.conversionPct}% buy, lift ${s.liftVsAvg >= 0 ? "+" : ""}${s.liftVsAvg}pp)`);
  console.log(`  Behavior: ${s.behavior.avgHumanMin} min · tariff ${s.behavior.avgTarifMin} min · ${s.behavior.avgClicks} clicks · step6 ${s.behavior.reachStep6Pct}%`);
  console.log(`  If drop: ${s.outcome.topDropReason?.label || "—"} @ step ${s.outcome.topExitStep?.step || "?"}, mood ${s.outcome.topMood?.label}`);
  console.log(`  If buy: ${s.outcome.topPurchasedTarif ? s.outcome.topPurchasedTarif.tarif : "—"}`);
  console.log(`  Coach → ${s.coachSuggest}`);
});

console.log("\n── TOP PROFILE PREDICTORS (conversion) ──");
highConv.slice(0, 6).forEach((c) => console.log(`  ✓ ${c.label}: ${c.conversionPct}% (${c.purchased}/${c.n})`));
console.log("\n── TOP PROFILE PREDICTORS (drop risk) ──");
lowConv.slice(0, 6).forEach((c) => console.log(`  ✗ ${c.label}: ${c.conversionPct}% (${c.purchased}/${c.n}) → ${c.outcome.topDropReason?.label}`));

console.log(`\n  ✓ full report → ${out}\n`);

#!/usr/bin/env node
/**
 * "Will the coach actually help?" — projects the conversion uplift if the live
 * coach intervened on every dropped session in a run.
 *
 * Method (transparent + tunable):
 *   1. For each DROPPED session we read its drop reason (from the same data the
 *      live coach sees at runtime).
 *   2. We map that reason to an intervention + a RECOVERY RATE = the estimated
 *      probability that the coach's help converts that specific drop into an
 *      online purchase. These rates are MODEL ASSUMPTIONS, grounded in the
 *      pattern analysis (e.g. step-6 "commitment" drops are almost-buyers, so
 *      they recover at a higher rate than "prefer_human" drops).
 *   3. Expected recovered = Σ recoveryRate. New conversion = (bought + recovered)/N.
 *
 * Output: ui/src/data/coachImpact.json (consumed by the on-screen helper) and a
 * terminal summary. Recovery rates live in ONE place so they can be re-tuned or
 * replaced by a real A/B test later.
 *
 * Usage: node scripts/eval-coach-impact.mjs --run live400
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RUN = process.argv.includes("--run") ? process.argv[process.argv.indexOf("--run") + 1] : "live400";
const sessDir = join(ROOT, "test-results", RUN, "sessions");
const OUT = join(ROOT, "..", "ui", "src", "data", "coachImpact.json");

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const round1 = (n) => Math.round(n * 10) / 10;

// ─── Intervention model ──────────────────────────────────────────────────────
// recoveryRate = P(online purchase | coach intervenes on this drop reason).
// Grounded in the live400 pattern analysis; clearly an estimate to validate.
const INTERVENTIONS = {
  final_price_commitment: {
    rate: 0.30,
    intervention: "Abschluss absichern: Widerruf, fixer Preis, optional Rückruf — kein Tarifwechsel",
    why: "Fast-Käufer auf Schritt 6 (32% kaufen hier ohnehin) — Verbindlichkeits-Angst ist gut adressierbar.",
  },
  advisory_wall: {
    rate: 0.15,
    intervention: "Start online anbieten / Plus per Beratung buchen statt Sackgasse",
    why: "Sie wollen passenden Schutz; ein klarer Online-Weg (Start/Optimal) rettet einen Teil.",
  },
  want_to_compare: {
    rate: 0.12,
    intervention: "Vergleich/Angebot speichern, Markt-Einordnung zeigen",
    why: "Vergleicher sind nicht ablehnend — Speichern + Einordnung hält sie.",
  },
  complexity_overwhelm: {
    rate: 0.15,
    intervention: "Auf 1 Empfehlung reduzieren statt alle Optionen offen lassen",
    why: "Überforderung sinkt mit klarer Default-Empfehlung.",
  },
  not_sure_applies: {
    rate: 0.12,
    intervention: "In einfacher Sprache erklären, welche Option passt",
    why: "Unsicherheit ist mit Klartext-Hilfe lösbar.",
  },
  weak_value: {
    rate: 0.10,
    intervention: "Gegenwert konkret machen (€/Tag, was abgedeckt ist)",
    why: "Preis-Leistung-Zweifel lassen sich teils mit Framing drehen.",
  },
  price_vs_income: {
    rate: 0.06,
    intervention: "Günstigeren Start-Tarif + €/Tag-Framing zeigen",
    why: "Echte Budget-Grenze — nur kleiner Teil über günstigeren Tarif erreichbar.",
  },
  data_privacy_fatigue: {
    rate: 0.10,
    intervention: "Felder reduzieren, Fortschritt + Datenschutz transparent zeigen",
    why: "Formular-Müdigkeit ist UX-seitig adressierbar.",
  },
  prefer_human: {
    rate: 0.04,
    intervention: "Rückruf/Chat anbieten (zählt meist als Beratung, nicht online)",
    why: "Will überwiegend einen Menschen — kaum Online-Rettung.",
  },
  no_felt_need: {
    rate: 0.03,
    intervention: "Akut-Nutzen/Anlass aufzeigen",
    why: "Kein akuter Bedarf — schwer kurzfristig zu drehen.",
  },
  other: {
    rate: 0.05,
    intervention: "Kontexthilfe + Rückfrage",
    why: "Unspezifisch — moderate Annahme.",
  },
};

function reasonOf(s) {
  return s.stoppedAt?.reasonCode || s.walk?.at(-1)?.dropReasonCode || "other";
}

const sessions = readdirSync(sessDir).filter((f) => f.endsWith(".json")).map((f) =>
  JSON.parse(readFileSync(join(sessDir, f), "utf8")),
);

const bought = sessions.filter((s) => s.status === "completed_online");
const dropped = sessions.filter((s) => s.status !== "completed_online");
const N = sessions.length;

const byReason = {};
const byStep = {};
let recoveredTotal = 0;

dropped.forEach((s) => {
  const code = reasonOf(s);
  const model = INTERVENTIONS[code] || INTERVENTIONS.other;
  const step = s.stoppedAt?.step ?? 8;

  byReason[code] = byReason[code] || { code, drops: 0, recoveryRate: model.rate, recovered: 0, intervention: model.intervention, why: model.why };
  byReason[code].drops += 1;
  byReason[code].recovered += model.rate;

  byStep[step] = byStep[step] || { step, drops: 0, recovered: 0 };
  byStep[step].drops += 1;
  byStep[step].recovered += model.rate;

  recoveredTotal += model.rate;
});

Object.values(byReason).forEach((r) => { r.recovered = round1(r.recovered); r.recoveredPctOfReason = pct(r.recovered, r.drops); });
Object.values(byStep).forEach((r) => { r.recovered = round1(r.recovered); });

const baselinePct = pct(bought.length, N);
const projectedConversions = bought.length + recoveredTotal;
const projectedPct = pct(projectedConversions, N);
const upliftPp = round1(projectedPct - baselinePct);
const relativeUpliftPct = baselinePct ? round1((upliftPp / baselinePct) * 100) : 0;

const reasonsRanked = Object.values(byReason).sort((a, b) => b.recovered - a.recovered);

const report = {
  run: RUN,
  generatedAt: new Date().toISOString(),
  method: "Per-drop recovery-rate model. Recovery rates are tunable assumptions grounded in pattern analysis — validate with a real A/B test.",
  totals: {
    sessions: N,
    purchasedBaseline: bought.length,
    droppedBaseline: dropped.length,
    expectedRecovered: round1(recoveredTotal),
    projectedPurchased: round1(projectedConversions),
  },
  conversion: {
    baselinePct,
    projectedWithCoachPct: projectedPct,
    upliftPp,
    relativeUpliftPct,
  },
  verdict:
    upliftPp >= 3
      ? `Ja — der Coach hebt die Conversion projiziert um +${upliftPp} Prozentpunkte (${baselinePct}% → ${projectedPct}%), v.a. durch Schritt-6-Absicherung und einen Online-Weg an der Tarif-Mauer.`
      : `Begrenzt — projiziert +${upliftPp} pp. Größter Hebel: ${reasonsRanked[0]?.code}.`,
  topLevers: reasonsRanked.slice(0, 5).map((r) => ({
    reason: r.code,
    drops: r.drops,
    recoveryRate: r.recoveryRate,
    expectedRecovered: r.recovered,
    intervention: r.intervention,
  })),
  byReason: reasonsRanked,
  byStep: Object.values(byStep).sort((a, b) => a.step - b.step),
  recoveryRates: Object.fromEntries(Object.entries(INTERVENTIONS).map(([k, v]) => [k, v.rate])),
};

writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log(`\n▶ Coach-Wirkung (${RUN}, n=${N})\n`);
console.log(`  Baseline-Conversion : ${baselinePct}%  (${bought.length}/${N})`);
console.log(`  Mit Coach (proj.)   : ${projectedPct}%  (+${upliftPp} pp · +${relativeUpliftPct}% relativ)`);
console.log(`  Erwartet gerettet   : ${round1(recoveredTotal)} Online-Abschlüsse\n`);
console.log(`  ${report.verdict}\n`);
console.log("  Größte Hebel:");
reasonsRanked.slice(0, 6).forEach((r) =>
  console.log(`   ${String(r.recovered).padStart(5)} ← ${r.code} (${r.drops} Drops × ${Math.round(r.recoveryRate * 100)}%)`),
);
console.log(`\n  ✓ ${OUT}\n`);

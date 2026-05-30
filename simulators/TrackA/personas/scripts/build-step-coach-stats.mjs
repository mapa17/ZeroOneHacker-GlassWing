#!/usr/bin/env node
/**
 * Per-step coach stats from live400 — tracking only, for direct probability lookup.
 * Output: ui/src/data/stepCoachStats.json
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RUN_ARG = process.argv.includes("--run") ? process.argv[process.argv.indexOf("--run") + 1] : "live400";
const RUNS = process.argv.includes("--runs")
  ? process.argv[process.argv.indexOf("--runs") + 1].split(",").map((s) => s.trim())
  : [RUN_ARG];
const sessDirs = RUNS.map((r) => join(ROOT, "test-results", r, "sessions"));
const OUT = join(ROOT, "..", "ui", "src", "data", "stepCoachStats.json");

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

function cumulativeAtStep(session, upToStep) {
  const tel = session.telemetry || {};
  const sum = tel.summary || {};
  const events = (tel.events || []).filter((e) => (e.step ?? 0) <= upToStep);
  const buttons = {};
  events.filter((e) => e.type === "button").forEach((e) => {
    buttons[e.key] = (buttons[e.key] || 0) + 1;
  });
  const clicks = Object.values(buttons).reduce((a, b) => a + b, 0);
  const hovers = (tel.hovers || []).filter((h) => (h.step ?? 0) <= upToStep).length;
  const backPresses = (tel.backPresses || []).filter((b) => b.step <= upToStep).length;
  const pageMs = session.timeModel?.perStep?.slice(0, upToStep + 1)
    .reduce((s, p) => s + (p.humanEquivalentMs || p.recordedCompressedMs || 0), 0)
    || tel.pages
      ? Object.entries(tel.pages).filter(([k]) => Number(k) <= upToStep).reduce((s, [, p]) => s + (p.totalTimeMs || 0), 0)
      : 0;
  const tarifMs = session.timeModel?.perStep?.find((p) => p.step === 3)?.humanEquivalentMs
    ?? tel.pages?.[3]?.totalTimeMs ?? 0;
  const tarif = session.selections?.tarif || sum.selectedTarif || null;
  const cursor = tel.summary?.cursorMoves ?? 0; // full session proxy
  const tarifClicks = Object.keys(buttons).filter((k) => k.startsWith("tarif_select_")).length;

  let engagement = "medium";
  let pace = "medium";
  const fastDecider = pageMs < 50000 && (clicks >= 4 || tarifClicks >= 1 || tarif);
  if (clicks <= 3 && pageMs < 25000 && !tarif) engagement = "low";
  else if (clicks >= 9 || pageMs > 120000 || fastDecider) engagement = "high";
  if (pageMs < 45000) pace = fastDecider ? "fast_engaged" : "fast";
  else if (pageMs > 120000) pace = "slow";

  const advisoryHovers = (tel.hovers || []).filter(
    (h) => (h.step ?? 0) <= upToStep && ((h.target || "").includes("advisory") || h.online === false),
  ).length;

  return {
    clicks, hovers, backPresses, pageMs, tarifMs, tarif, engagement, pace, fastDecider, tarifClicks, advisoryHovers,
    humanMin: Math.round(pageMs / 600) / 100,
  };
}

const sessions = sessDirs.flatMap((dir) =>
  readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) =>
    JSON.parse(readFileSync(join(dir, f), "utf8")),
  ),
);

const purchased = (s) => s.status === "completed_online";
const maxStep = (s) => {
  const w = s.walk || [];
  const last = s.stoppedAt?.step ?? 8;
  return purchased(s) ? 8 : last;
};

const STEP_NAMES = {
  0: "Absicherungsbereich",
  1: "Versicherte Person",
  2: "Geburtsdatum & Sozialversicherung",
  3: "Tarif-Auswahl",
  4: "Zusatzleistungen",
  5: "Persönliche Angaben",
  6: "Bisherige Versicherungen",
  7: "Beratungsweg",
  8: "Ergebnis",
};

const DROP_LABELS = {
  advisory_wall: "Beratungs-Mauer (Tarif nur mit Beratung)",
  final_price_commitment: "Zögern beim Abschluss",
  prefer_human: "Wünscht persönliche Beratung",
  want_to_compare: "Will vergleichen",
  complexity_overwhelm: "Zu komplex",
  not_sure_applies: "Unsicher welche Option",
  price_vs_income: "Preis zu hoch",
  weak_value: "Unklarer Gegenwert",
  other: "Sonstiges",
};

const stepStats = {};
for (let step = 0; step <= 8; step++) {
  const reached = sessions.filter((s) => maxStep(s) >= step || (s.walk || []).some((w) => w.step === step));
  const bought = reached.filter(purchased);
  const dropped = reached.filter((s) => !purchased(s));

  const dropReasons = {};
  dropped.forEach((s) => {
    const c = s.stoppedAt?.reasonCode || "other";
    dropReasons[c] = (dropReasons[c] || 0) + 1;
  });
  const topReason = Object.entries(dropReasons).sort((a, b) => b[1] - a[1])[0];

  const byEngagement = {};
  ["low", "medium", "high"].forEach((eng) => {
    const sub = reached.filter((s) => cumulativeAtStep(s, step).engagement === eng);
    if (sub.length >= 5) {
      byEngagement[eng] = {
        n: sub.length,
        purchasePct: pct(sub.filter(purchased).length, sub.length),
        avgClicks: Math.round(sub.reduce((a, s) => a + cumulativeAtStep(s, step).clicks, 0) / sub.length),
      };
    }
  });

  const byPace = {};
  ["fast", "fast_engaged", "medium", "slow"].forEach((p) => {
    const sub = reached.filter((s) => cumulativeAtStep(s, step).pace === p);
    if (sub.length >= 5) {
      byPace[p] = {
        n: sub.length,
        purchasePct: pct(sub.filter(purchased).length, sub.length),
      };
    }
  });

  const byTarif = {};
  ["start", "optimal", null].forEach((t) => {
    const sub = reached.filter((s) => (cumulativeAtStep(s, step).tarif || null) === t);
    if (sub.length >= 5) {
      byTarif[t || "none"] = { n: sub.length, purchasePct: pct(sub.filter(purchased).length, sub.length) };
    }
  });

  stepStats[step] = {
    step,
    page: STEP_NAMES[step],
    reached: reached.length,
    purchased: bought.length,
    purchasePct: pct(bought.length, reached.length),
    dropPct: pct(dropped.length, reached.length),
    topDropReason: topReason ? { code: topReason[0], label: DROP_LABELS[topReason[0]] || topReason[0], pct: pct(topReason[1], dropped.length) } : null,
    byEngagement,
    byPace,
    byTarif,
    support: buildSupport(step, topReason?.[0]),
  };
}

function buildSupport(step, topReason) {
  const base = {
    0: { title: "Einstieg klären", text: "In 21/400 Abbrüche schon hier. Kurz erklären: nur Arztbesuche vs. Krankenhaus extra.", action: "2 Optionen benennen, Krankenhaus als separates Produkt" },
    1: { title: "Personenkreis", text: "13 Abbrüche — oft „Andere Personen“. Wenn nur für sich: „Nur mich“ hervorheben.", action: "Bei Unsicherheit: Beratung anbieten" },
    2: { title: "Daten & Prämie", text: "29 Abbrüche. Geburtsdatum + ÖGK wirken technisch — Fortschritt sichtbar machen.", action: "Zeigen: „Ihre Prämie folgt gleich“" },
    3: { title: "Tarif-Entscheidung", text: "215/369 Abbrüche hier. Größte Hürde: Plus/Premium nur mit Beratung.", action: "Start vs Optimal empfehlen; Beratung buchen = Erfolg" },
    4: { title: "Zusatzleistungen", text: "23 Abbrüche — zu viele Module. Standard: keine Extras.", action: "„Optional — später nachrüstbar“" },
    5: { title: "Persönliche Daten", text: "Wenige Abbrüche — wer hier ist, ist nah dran.", action: "Datenschutz-Hinweis, Felder minimieren" },
    6: { title: "Abschluss & Verbindlichkeit", text: "66 Abbrüche — fast gekauft. Hauptgrund: zu verbindlich online.", action: "Widerruf, fixer Preis, kein Tarifwechsel" },
    7: { title: "Beratungsweg", text: "Beratungsroute — kein Online-Kauf.", action: "Termin / Rückruf" },
    8: { title: "Ergebnis", text: "Geschafft oder Beratung.", action: "Abschluss bestätigen" },
  };
  const s = base[step] || base[0];
  if (step === 3 && topReason === "advisory_wall") {
    s.action = "Konkret: „Optimal online — Plus nur mit Beratung“ + Buchungsbutton";
  }
  if (step === 6 && topReason === "final_price_commitment") {
    s.action = "„Preis bleibt €X — 14 Tage widerrufbar — optional Rückruf“";
  }
  return s;
}

const report = {
  source: `${RUNS.join(" + ")} (${sessions.length} sessions)`,
  generatedAt: new Date().toISOString(),
  baselinePurchasePct: pct(sessions.filter(purchased).length, sessions.length),
  steps: stepStats,
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify(stepStats, null, 2));

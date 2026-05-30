// What the user has actually done on the form — for the chat coach LLM.
// No PII (names, email, SV number). Ground truth from form state + tracking.

import { ADDONS, tariff } from "../data/product.js";
import { filled, fmt } from "./form.js";
import { PAGE_NAMES } from "../logs/constants.js";

function tarifWasChosenOnPage(snap) {
  return Object.keys(snap.buttons || {}).some((k) => k.startsWith("tarif_select_"));
}

function recentActions(snap, limit = 10) {
  return (snap.events || [])
    .filter((e) => ["button", "hover", "field", "validation_failed", "page_enter"].includes(e.type))
    .slice(-limit)
    .map((e) => {
      if (e.type === "button") return `Klick „${e.key}" (Schritt ${e.step ?? "?"})`;
      if (e.type === "hover") return `Hover „${e.target}" ${e.dwellReadable || ""}`.trim();
      if (e.type === "field") {
        if (e.key?.startsWith("coverage_")) return `Absicherung ${e.key.replace("coverage_", "")}: ${e.value}`;
        if (e.key === "insuredPerson") return `Versicherte Person: ${e.value}`;
        return `Feld „${e.key}" geändert`;
      }
      if (e.type === "validation_failed") return `Weiter blockiert — fehlende Felder: ${(e.fields || []).join(", ")}`;
      if (e.type === "page_enter") return `Seite betreten: ${e.name || PAGE_NAMES[e.step]}`;
      return e.type;
    });
}

function tarifInteraction(snap) {
  const clicks = Object.entries(snap.buttons || {})
    .filter(([k]) => k.startsWith("tarif_select_"))
    .map(([k, n]) => ({ key: k.replace("tarif_select_", ""), clicks: n }));
  const hovers = (snap.hovers || [])
    .filter((h) => (h.target || "").includes("tarif") || (h.target || "").includes("advisory"))
    .slice(-6)
    .map((h) => ({
      target: h.target,
      dwell: h.dwellReadable,
      tarif: h.tarif,
      online: h.online,
    }));
  return { clicks, hovers };
}

/** @param {object} form @param {number} step @param {number} premium @param {object} outcome @param {object} snap @param {object} stepErrors */
export function buildScreenContext(form, step, premium, outcome, snap, stepErrors = {}) {
  const onTariffStepOrLater = step >= 3;
  const tarifChosen = tarifWasChosenOnPage(snap);
  const t = form.tarif && (onTariffStepOrLater || tarifChosen) ? tariff(form.tarif) : null;

  const coverage = [];
  if (form.coverage?.arzt) coverage.push("Bei Arztbesuchen");
  if (form.coverage?.krankenhaus) coverage.push("Im Krankenhaus");
  if (!coverage.length) coverage.push("(noch nichts gewählt)");

  let insuredLabel = "(noch nicht gewählt)";
  if (form.insuredPerson === "myself") insuredLabel = "Ich selbst";
  else if (form.insuredPerson === "others") insuredLabel = "Andere Personen";

  const addons = ADDONS.filter((a) => form.addons?.[a.key]).map((a) => a.name);

  const ctx = {
    currentStep: step,
    currentPage: PAGE_NAMES[step],
    selections: {
      coverage: coverage.join(" + "),
      hospitalProduct: !!form.coverage?.krankenhaus,
      insuredPerson: insuredLabel,
      geburtsdatumEntered: filled(form.geburtsdatum),
      sozialversicherung: form.sozialversicherung || "(noch nicht gewählt)",
      tarif: t ? t.name : "(noch nicht gewählt)",
      tarifKey: t?.key ?? null,
      tarifOnlineAbschluss: t ? t.online : null,
      tarifBadge: t?.badge ?? null,
      tarifExplicitlyClicked: tarifChosen,
      addons: addons.length ? addons : ["keine Zusatzmodule"],
      beratungsort: form.beratungsort || null,
    },
    pricing: step >= 3 && t
      ? { monthlyPremium: fmt(premium), note: "Monatsprämie inkl. gewählter Zusatzmodule" }
      : null,
    healthQuestions: step >= 6 ? {
      privatVersichert7J: form.privatVersichert7 || "(offen)",
      antraegeAbgelehnt: form.antraegeAbgelehnt || "(offen)",
      besondereAnnahme: form.besondereAnnahme || "(offen)",
      anyJa: [form.privatVersichert7, form.antraegeAbgelehnt, form.besondereAnnahme].includes("ja"),
    } : null,
    personalFormProgress: step >= 5 ? {
      geschlecht: filled(form.geschlecht),
      kontaktFilled: filled(form.email) && filled(form.telefon),
      koerperFilled: filled(form.groesse) && filled(form.gewicht),
      sport: form.leistungssport || "(offen)",
      schwangerschaft: form.schwangerschaft || "(offen)",
    } : null,
    funnelRoute: {
      projected: outcome.route,
      reasons: outcome.reasons?.length ? outcome.reasons : ["Online abschließbar"],
    },
    validationBlockingNow: Object.keys(stepErrors).length
      ? Object.entries(stepErrors).map(([k, v]) => `${k}: ${v}`)
      : [],
    recentActions: recentActions(snap),
    tarifInteraction: tarifInteraction(snap),
    pagesVisited: Object.keys(snap.pages || {}).map((k) => PAGE_NAMES[k]).filter(Boolean),
  };

  return ctx;
}

/** Short dynamic hint reflecting actual selections — replaces generic static text */
export function buildDynamicStepHint(form, step, premium, snap) {
  const ctx = buildScreenContext(form, step, premium, { route: "online", reasons: [] }, snap);
  switch (step) {
    case 0:
      if (form.coverage?.krankenhaus && !form.coverage?.arzt)
        return "Sie schauen sich Krankenhaus an — das ist ein anderes Produkt als Privatarzt. Für Arztbesuche wählen Sie „Bei Arztbesuchen“.";
      if (form.coverage?.arzt && form.coverage?.krankenhaus)
        return "Beide Optionen sind aktiv. Für den Online-Privatarzt-Tarif reicht meist „Bei Arztbesuchen“.";
      if (form.coverage?.arzt)
        return "Gute Wahl: „Bei Arztbesuchen“ passt zum Privatarzt-Schutz. Fragen? Schreiben Sie mir.";
      return STEP_HINTS[0];
    case 1:
      if (form.insuredPerson === "others")
        return "„Andere Personen“ — dafür brauchen Sie oft eine persönliche Beratung, nicht den Online-Abschluss.";
      if (form.insuredPerson === "myself")
        return "„Ich selbst“ — passt für den Online-Weg. Weiter geht's zur Prämie.";
      return STEP_HINTS[1];
    case 3: {
      const ti = ctx.tarifInteraction;
      if (ctx.selections.tarifExplicitlyClicked && ctx.selections.tarifKey) {
        const t = tariff(ctx.selections.tarifKey);
        if (!t.online)
          return `Sie haben „${t.name}" gewählt — der geht nur mit Beratung. Online gehen Start oder Optimal.`;
        return `Sie haben „${t.name}" gewählt (${fmt(premium)}/Monat) — online abschließbar.`;
      }
      if (ti.hovers.some((h) => (h.target || "").includes("advisory")))
        return "Sie schauen sich Tarife an, die nur mit Beratung gehen. Soll ich Start oder Optimal erklären?";
      return STEP_HINTS[3];
    }
    case 6:
      if (ctx.healthQuestions?.anyJa)
        return "Bei mindestens einem „Ja“ geht es zur Beratung — das ist normal, kein Fehler.";
      return STEP_HINTS[6];
    default:
      return STEP_HINTS[step] || null;
  }
}

const STEP_HINTS = {
  0: "Zwei Optionen: Arztbesuche (Privatarzt) vs. Krankenhaus (anderes Produkt).",
  1: "Wer versichert werden soll — für sich selbst: „Ich selbst“.",
  2: "Geburtsdatum und Sozialversicherung — danach sehen Sie die Tarife.",
  3: "Start und Optimal online abschließbar. Plus/Premium nur nach Beratung.",
  4: "Zusatzmodule sind optional.",
  5: "Persönliche Angaben für die Berechnung.",
  6: "Drei Gesundheitsfragen — überall „nein“ = online weiter.",
  7: "Beratungsweg wählen.",
  8: "Ergebnis — Abschluss oder Beratung.",
};

export function screenContextForLLM(form, step, premium, outcome, snap, stepErrors) {
  return JSON.stringify(buildScreenContext(form, step, premium, outcome, snap, stepErrors), null, 2);
}

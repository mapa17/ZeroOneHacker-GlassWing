// Turns a tracking snapshot (from useTracking.buildSnapshot) into:
//   - behavioral signals (dwell, hovers, back-presses, hesitation score)
//   - a drop-off read (where + why the session left, if it did)
//   - a persona match against the 3 UNIQA segments (Judith / Franz / Peter)
//
// All heuristics are derived from personas/*.md. They are intentionally
// transparent (additive points + human-readable reasons) so the dashboard can
// explain *why* a session was classified the way it was.

import { PERSONAS, personaById } from "../data/personas.js";
import { DWELL_THRESHOLDS, msToReadable, PAGE_NAMES } from "../logs/constants.js";

const TARIF_SLOW = DWELL_THRESHOLDS[3].slow; // 20s
const TARIF_HIGH = DWELL_THRESHOLDS[3].high; // 45s
const FAST_STEP_MS = 6000; // a step done in < 6s counts as "fast"

const sum = (arr) => arr.reduce((s, n) => s + n, 0);

export function extractSignals(snap) {
  const pages = snap.pages || {};
  const buttons = snap.buttons || {};
  const fields = snap.fields || {};
  const hovers = snap.hovers || [];
  const backPresses = snap.backPresses || [];
  const abandons = snap.abandons || [];
  const events = snap.events || [];

  const pageMs = (s) => pages[s]?.totalTimeMs || 0;

  // tariff interaction
  const tarifClicks = Object.keys(buttons)
    .filter((k) => k.startsWith("tarif_select_"))
    .reduce((s, k) => s + buttons[k], 0);
  const tarifSelectEvents = events.filter(
    (e) => e.type === "button" && e.key && e.key.startsWith("tarif_select_")
  );
  const distinctTariffsClicked = new Set(
    tarifSelectEvents.map((e) => e.key.replace("tarif_select_", ""))
  ).size;
  const tarifDwellMs = pageMs(3);

  // hovers
  const advisoryHoverList = hovers.filter(
    (h) =>
      (h.target || "").startsWith("advisory_badge_") ||
      ((h.target || "").startsWith("tarif_card_") && h.online === false)
  );
  const advisoryHovers = advisoryHoverList.length;
  const advisoryHoverMs = sum(advisoryHoverList.map((h) => h.dwellMs || 0));
  const tarifCardHovers = hovers.filter((h) => (h.target || "").startsWith("tarif_card_"));
  const distinctTariffsHovered = new Set(
    tarifCardHovers.map((h) => h.tarif).filter(Boolean)
  ).size;
  const ctaHoverList = hovers.filter((h) => h.target === "cta_weiter");
  const ctaHesitations = ctaHoverList.length;

  // back-navigation
  const backByStep = {};
  backPresses.forEach((b) => { backByStep[b.step] = (backByStep[b.step] || 0) + 1; });
  const totalBack = backPresses.length;

  // add-on churn
  const addonChurn = Object.keys(buttons)
    .filter((k) => k.startsWith("addon_toggle_"))
    .reduce((s, k) => s + buttons[k], 0);

  // coverage hesitation (step 0)
  const coverageToggleCount = Object.keys(buttons)
    .filter((k) => k.startsWith("coverage_toggle_"))
    .reduce((s, k) => s + buttons[k], 0);
  const bothCoverageChecked =
    fields.coverage_arzt?.value === "on" && fields.coverage_krankenhaus?.value === "on";

  // early-step speed (steps 0–2)
  const earlyVisited = [0, 1, 2].filter((s) => pages[s]);
  const fastEarly =
    earlyVisited.length >= 2 && earlyVisited.every((s) => pageMs(s) < FAST_STEP_MS);

  // overwhelmed = parked on the tariff page with no selection at all
  const overwhelmedTariff = tarifDwellMs >= TARIF_HIGH && tarifClicks === 0;

  // completion / abandonment
  const completeEvent = events.find((e) => e.type === "funnel_complete");
  const reachedOutcome =
    typeof snap.reachedOutcome === "boolean"
      ? snap.reachedOutcome
      : (!!completeEvent || snap.currentStep === 8);
  // True online completion. Prefer the authoritative snapshot flag; fall back to
  // the funnel_complete event status / route for legacy or real session files.
  let completed;
  if (typeof snap.completed === "boolean") {
    completed = snap.completed;
  } else if (completeEvent) {
    completed = completeEvent.status
      ? completeEvent.status === "completed"
      : completeEvent.route === "online";
  } else {
    completed = false;
  }
  // Reached the result page via the advisor route without finishing online.
  const advisorForward =
    typeof snap.advisorForward === "boolean"
      ? snap.advisorForward
      : reachedOutcome && !completed;
  const abandonedAtStep = abandons.length ? abandons[abandons.length - 1].step : null;
  const reachedFinal = !!pages[8] || reachedOutcome;
  const route = snap.summary?.projectedRoute ?? snap.formChoices?.route;

  // composite price-hesitation score (0..~150+)
  const hesitationScore = Math.round(
    (tarifDwellMs / 1000) * 0.6 +
      tarifClicks * 10 +
      (backByStep[4] || 0) * 18 +
      (backByStep[3] || 0) * 15 +
      addonChurn * 4 +
      advisoryHovers * 8 +
      ctaHesitations * 10
  );

  return {
    tarifDwellMs,
    tarifDwellReadable: msToReadable(tarifDwellMs),
    tarifClicks,
    distinctTariffsClicked,
    tarifSwitches: tarifClicks,
    advisoryHovers,
    advisoryHoverMs,
    distinctTariffsHovered,
    ctaHesitations,
    backByStep,
    totalBack,
    addonChurn,
    coverageToggleCount,
    bothCoverageChecked,
    fastEarly,
    overwhelmedTariff,
    completed,
    advisorForward,
    reachedOutcome,
    abandonedAtStep,
    reachedFinal,
    route,
    hesitationScore,
  };
}

function scoreJudith(s) {
  let score = 0;
  const reasons = [];
  const tarifModerate = s.tarifDwellMs >= TARIF_SLOW && s.tarifDwellMs < TARIF_HIGH;
  if (tarifModerate && s.tarifClicks >= 1) {
    score += 28; reasons.push("Verlangsamt überlegt auf der Tarif-Seite");
  }
  if (s.advisoryHovers >= 1) {
    score += 20; reasons.push("Interesse an „Nur nach Beratung“-Tarifen");
  }
  if (s.tarifSwitches >= 1 && s.tarifSwitches <= 3) {
    score += 16; reasons.push("Vergleicht mehrere Tarife");
  }
  if (s.advisoryHoverMs >= 2000) score += 8;
  score += Math.min(s.ctaHesitations, 2) * 8;
  if (s.reachedFinal) score += 10;
  if (s.abandonedAtStep === 3 || s.abandonedAtStep === 8) {
    score += 12; reasons.push("Ausstieg an Tarif-/Endpreis-Hürde");
  }
  if (s.overwhelmedTariff) score -= 10;
  if (s.fastEarly) score -= 8;
  return { score: Math.max(0, score), reasons };
}

function scoreFranz(s) {
  let score = 0;
  const reasons = [];
  if (s.fastEarly) { score += 30; reasons.push("Rast durch die frühen Schritte"); }
  if (s.tarifClicks >= 1 && s.tarifSwitches <= 1) {
    score += 22; reasons.push("Schnelle, sichere Tarif-Entscheidung");
  }
  if (s.advisoryHovers >= 1) { score += 12; reasons.push("Reagiert auf „Nur nach Beratung“"); }
  if (s.reachedFinal && s.fastEarly) { score += 18; reasons.push("Kommt zügig bis zum Endpreis"); }
  score += Math.min(s.ctaHesitations, 3) * 8;
  if (s.abandonedAtStep === 8 || (s.abandonedAtStep !== null && s.abandonedAtStep >= 6)) {
    score += 16; reasons.push("Bricht spät ab (Endpreis)");
  }
  if (s.totalBack === 0 && s.tarifClicks >= 1) score += 8;
  if (s.overwhelmedTariff) score -= 20;
  return { score: Math.max(0, score), reasons };
}

function scorePeter(s) {
  let score = 0;
  const reasons = [];
  if (s.overwhelmedTariff) {
    score += 40; reasons.push("Lange auf der Tarif-Seite ohne Auswahl (überfordert)");
  } else if (s.tarifDwellMs >= TARIF_SLOW && s.tarifClicks === 0) {
    score += 22; reasons.push("Zögert bei der Tarif-Auswahl");
  }
  if (s.bothCoverageChecked) {
    score += 18; reasons.push("Beide Absicherungs-Optionen geprüft (unsicher)");
  }
  if (s.coverageToggleCount >= 3) score += 8;
  score += Math.min(s.backByStep[3] || 0, 3) * 12;
  if (s.backByStep[3]) reasons.push("Zurück von der Tarif-Seite");
  if (s.abandonedAtStep !== null && s.abandonedAtStep <= 3) {
    score += 22; reasons.push("Früher Ausstieg (vor/auf der Tarif-Seite)");
  }
  if (s.tarifClicks === 0 && s.distinctTariffsHovered >= 2) {
    score += 8; reasons.push("Schaut Tarife an, wählt aber keinen");
  }
  if (s.route === "beratung") score += 6;
  return { score: Math.max(0, score), reasons };
}

const SCORERS = { judith: scoreJudith, franz: scoreFranz, peter: scorePeter };

export function classify(signals) {
  const raw = {};
  const reasonsById = {};
  PERSONAS.forEach((p) => {
    const r = SCORERS[p.id](signals);
    raw[p.id] = r.score;
    reasonsById[p.id] = r.reasons;
  });

  const total = sum(Object.values(raw)) || 0;
  const scores = {};
  PERSONAS.forEach((p) => {
    scores[p.id] = total > 0 ? Math.round((raw[p.id] / total) * 100) : 0;
  });

  let bestId = null;
  let bestRaw = 0;
  PERSONAS.forEach((p) => {
    if (raw[p.id] > bestRaw) { bestRaw = raw[p.id]; bestId = p.id; }
  });

  const enoughSignal = bestRaw >= 20;
  const match = enoughSignal
    ? {
        id: bestId,
        confidence: scores[bestId],
        reasons: reasonsById[bestId].slice(0, 4),
      }
    : null;

  return { raw, scores, reasonsById, match };
}

export function buildFunnel(snap) {
  const pages = snap.pages || {};
  const backByStep = {};
  (snap.backPresses || []).forEach((b) => {
    backByStep[b.step] = (backByStep[b.step] || 0) + 1;
  });
  // Linear view of the funnel; branch-only steps (7) simply show "not reached".
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].map((step) => {
    const p = pages[step];
    return {
      step,
      name: p?.name,
      reached: !!p,
      enters: p?.enters || 0,
      dwellMs: p?.totalTimeMs || 0,
      current: !!p?.current,
      backOut: backByStep[step] || 0,
    };
  });
}

function dropOffReason(step) {
  if (step <= 2) return "Früher Ausstieg — Komplexität/Unsicherheit";
  if (step === 3 || step === 4) return "Tarif-Seite — Preis/Komplexität oder Beratungs-Mauer";
  if (step >= 6) return "Endpreis — Preis-Abweichung / fehlende Begründung";
  return "Ausstieg im Funnel";
}

export function analyzeSession(snap) {
  const signals = extractSignals(snap);
  const classification = classify(signals);
  const funnel = buildFunnel(snap);

  let dropOff = null;
  if (signals.abandonedAtStep !== null) {
    dropOff = {
      step: signals.abandonedAtStep,
      page: (snap.pages?.[signals.abandonedAtStep]?.name) || `Schritt ${signals.abandonedAtStep}`,
      reason: dropOffReason(signals.abandonedAtStep),
    };
  } else if (signals.advisorForward) {
    dropOff = {
      step: 7,
      page: PAGE_NAMES[7],
      reason: "Zur Beratung weitergeleitet — kein Online-Abschluss",
      advisorForward: true,
    };
  } else if (!signals.completed && !signals.reachedOutcome) {
    dropOff = {
      step: snap.currentStep,
      page: snap.currentPage,
      reason: "Sitzung läuft noch — aktuelle Position",
      inProgress: true,
    };
  }

  return { signals, classification, funnel, dropOff };
}

// Compact, human-readable analysis block embedded into the exported JSON so the
// file itself answers "who is this user and why" — no separate tool needed.
export function analysisForExport(snap) {
  const { signals, classification, dropOff } = analyzeSession(snap);
  const m = classification.match;
  const persona = m ? personaById(m.id) : null;

  return {
    note: "Persona-Erkennung anhand des Verhaltens (Verweildauer, Hover/Cursor, Tarif-Wechsel, Zurück-Navigation). Transparente, additive Heuristik.",
    whoIsThis: persona
      ? {
          persona: persona.name,
          segment: persona.segment,
          confidence: `${m.confidence}%`,
          why: m.reasons,
          recommendedIntervention: persona.intervention,
        }
      : "unklar — noch zu wenig Verhaltenssignal für eine sichere Zuordnung",
    personaScores: {
      "Judith (Hybrid)": `${classification.scores.judith}%`,
      "Franz (Online-affin)": `${classification.scores.franz}%`,
      "Peter (Service-affin)": `${classification.scores.peter}%`,
    },
    dropOff,
    keySignals: {
      tarifDwell: signals.tarifDwellReadable,
      tarifSwitches: signals.tarifSwitches,
      advisoryHovers: signals.advisoryHovers,
      ctaHesitations: signals.ctaHesitations,
      backPresses: signals.totalBack,
      bothCoverageChecked: signals.bothCoverageChecked,
      overwhelmedOnTariff: signals.overwhelmedTariff,
      fastEarlySteps: signals.fastEarly,
      hesitationScore: signals.hesitationScore,
      completed: signals.completed,
      advisorForward: signals.advisorForward,
    },
  };
}

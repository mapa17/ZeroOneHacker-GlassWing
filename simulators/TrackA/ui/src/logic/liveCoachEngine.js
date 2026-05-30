// Live coach — direct per-step probabilities from live400 tracking data.
// No persona profile. Uses stepCoachStats.json + live useTracking snapshot.

import STEP_COACH from "../data/stepCoachStats.json";
import { extractSignals } from "./personaClassifier.js";
import { msToReadable } from "../logs/constants.js";

/** @typedef {{ id: string, type: 'question'|'info'|'action', priority: number, title: string, body: string, options?: { id: string, label: string }[], meta?: object }} CoachPrompt */

function pageMs(snap, step) {
  return snap.pages?.[step]?.totalTimeMs || 0;
}

function behaviorBucket(snap, signals) {
  const sum = snap.summary || {};
  const live = snap.liveOnStep || {};
  const sessionMs = snap.totalDurationMs || 0;
  const clicks = sum.totalButtonClicks || 0;
  const cursor = sum.cursorMoves ?? 0;
  const stepCursor = live.cursorMoves ?? 0;
  const step = snap.currentStep ?? 0;
  const tarifRaw = sum.selectedTarif || null;
  const tarifClicked = Object.keys(snap.buttons || {}).some((k) => k.startsWith("tarif_select_"));
  const tarif = (step >= 3 || tarifClicked) ? tarifRaw : null;
  const activeHovers = snap.activeHovers || [];
  const advisoryActive = activeHovers.some(
    (h) => (h.target || "").startsWith("advisory_badge_") || (h.target || "").includes("advisory"),
  );

  let engagement = "medium";
  const fastDecider = (sessionMs < 90000 || pageDwell < 25000)
    && (clicks >= 4 || stepCursor >= 6 || !!tarif || step >= 4);
  if ((stepCursor < 3 && cursor < 8) || (clicks <= 2 && sessionMs < 20000 && !tarif)) engagement = "low";
  else if (stepCursor >= 12 || cursor >= 22 || clicks >= 9 || fastDecider) engagement = "high";

  let pace = "medium";
  const pageDwell = live.pageDwellMs ?? pageMs(snap, step);
  if (sessionMs < 90000 || pageDwell < 35000) pace = "fast";
  else if (sessionMs > 150000 || pageDwell > 90000) pace = "slow";

  let tarifState = "none";
  if (tarif === "start") tarifState = "start";
  else if (tarif === "optimal") tarifState = "optimal";
  else if (signals.overwhelmedTariff || (pageMs(snap, 3) > 60000 && !tarif)) tarifState = "stuck";
  else if (signals.distinctTariffsClicked >= 2 || signals.tarifClicks >= 2) tarifState = "comparing";

  return {
    engagement, pace, tarifState, step, sessionMs, clicks, cursor, stepCursor,
    pageDwellMs: pageDwell,
    tarif,
    fastDecider,
    activeHoverCount: activeHovers.length,
    advisoryHoverActive: advisoryActive,
    cursorPositionPct: snap.cursor?.positionPct || null,
  };
}

function stepData(step) {
  return STEP_COACH.steps[String(step)] || STEP_COACH.steps["0"];
}

/** Direct live400 lookup + live-signal adjustment with visible math */
function computeStepChances(step, bucket, signals, answers) {
  const sd = stepData(step);
  const basePct = sd.purchasePct;
  const sampleN = sd.reached;
  const purchasedN = sd.purchased;

  /** @type {{ label: string, purchasePct: number, n?: number }[]} */
  const adjustments = [];

  let adjustedPct = basePct;
  let dataSource = `live400: ${purchasedN}/${sampleN} kauften nach Schritt ${step}`;

  // Tarif-specific (direct from same step in live400)
  if (bucket.tarif && sd.byTarif?.[bucket.tarif]) {
    const t = sd.byTarif[bucket.tarif];
    adjustedPct = t.purchasePct;
    adjustments.push({
      label: `Tarif „${bucket.tarif}" gewählt`,
      purchasePct: t.purchasePct,
      n: t.n,
    });
    dataSource = `live400: ${Math.round(t.purchasePct * t.n / 100)}/${t.n} mit Tarif ${bucket.tarif} ab Schritt ${step}`;
  }

  // Tracking cohorts from live400 analysis — fast deciders are NOT bounces
  if (bucket.engagement === "low" && bucket.pace === "fast" && step <= 3 && !bucket.fastDecider) {
    adjustedPct = Math.min(adjustedPct, 3);
    adjustments.push({ label: "Schnell ohne Engagement (kein Tarif, wenig Interaktion)", purchasePct: 3, n: 101 });
    dataSource = "live400: sehr niedrige Chance bei schnellem Bounce ohne Signale";
  }

  if (bucket.fastDecider && step >= 2) {
    const boost = bucket.tarif && sd.byTarif?.[bucket.tarif]
      ? sd.byTarif[bucket.tarif].purchasePct
      : Math.max(basePct, 12);
    adjustedPct = Math.max(adjustedPct, boost);
    adjustments.push({
      label: "Schneller Entscheider (Klicks/Cursor/Tarif — Tempo allein zählt nicht)",
      purchasePct: adjustedPct,
      n: bucket.tarif ? sd.byTarif?.[bucket.tarif]?.n : sampleN,
    });
  }

  if (step >= 6 && bucket.engagement === "high") {
    adjustedPct = 32;
    adjustments.push({ label: "Schritt 6 erreicht + hohe Aktivität (10+ Klicks)", purchasePct: 32, n: 97 });
    dataSource = "live400: 31/97 Kauf wenn Schritt 6 erreicht (32%)";
  } else if (step >= 4 && !adjustments.length) {
    // Already high conditional rate in step stats — keep step table number
    adjustedPct = basePct;
  }

  if (signals.advisoryHovers >= 1 && step === 3 && !bucket.tarif) {
    adjustedPct = Math.min(adjustedPct, 4);
    adjustments.push({ label: "Hover auf Beratungs-Tarif ohne Auswahl", purchasePct: 4, n: 136 });
  }

  if (bucket.advisoryHoverActive && step === 3) {
    adjustedPct = Math.min(adjustedPct, 4);
    adjustments.push({ label: "Maus gerade über Beratungs-Tarif", purchasePct: 4, n: 136 });
  }

  if (bucket.stepCursor >= 20 && step >= 4) {
    adjustedPct = Math.max(adjustedPct, step >= 6 ? 32 : 25);
    adjustments.push({
      label: `Hohe Cursor-Aktivität auf Schritt (${bucket.stepCursor} Bewegungen)`,
      purchasePct: adjustedPct,
      n: 97,
    });
  }

  if (bucket.engagement === "low" && bucket.stepCursor < 3 && bucket.activeHoverCount === 0 && step <= 3) {
    adjustedPct = Math.min(adjustedPct, 2);
    adjustments.push({ label: "Wenig Maus/Cursor — desinteressiert", purchasePct: 2, n: 101 });
  }

  if (signals.overwhelmedTariff && step === 3) {
    adjustedPct = 0;
    adjustments.push({ label: ">45s Tarif-Seite ohne Klick", purchasePct: 0 });
  }

  // User answers refine estimate
  if (answers.channel === "advisor") {
    adjustedPct = 1;
    adjustments.push({ label: "Antwort: lieber Beratung", purchasePct: 1 });
  }
  if (answers.channel === "online" && bucket.tarif === "start" && step >= 3) {
    adjustedPct = Math.max(adjustedPct, sd.byTarif?.start?.purchasePct ?? 10);
  }
  if (answers.commitment === "yes" && step >= 6) {
    adjustedPct = 0;
    adjustments.push({ label: "Antwort: Abschluss zu verbindlich", purchasePct: 0, n: 63 });
  }
  if (answers.commitment === "no" && step >= 6) {
    adjustedPct = 32;
    adjustments.push({ label: "Antwort: kein Bedenken", purchasePct: 32 });
  }
  if (answers.comparing === "yes" && step === 3) {
    adjustedPct = Math.min(adjustedPct, 5);
    adjustments.push({ label: "Antwort: vergleicht woanders", purchasePct: 5, n: 50 });
  }

  const dropPct = Math.round((100 - adjustedPct) * 10) / 10;

  return {
    step,
    page: sd.page,
    basePct,
    adjustedPct: Math.round(adjustedPct * 10) / 10,
    dropPct,
    sampleN,
    purchasedN,
    dataSource,
    adjustments,
    topDropReason: sd.topDropReason,
    support: sd.support,
  };
}

function buildStepLadder(currentStep) {
  const ladder = [];
  for (let s = 0; s <= Math.min(currentStep, 8); s++) {
    const sd = stepData(s);
    ladder.push({
      step: s,
      page: sd.page,
      purchasePct: sd.purchasePct,
      reached: sd.reached,
      purchased: sd.purchased,
      current: s === currentStep,
    });
  }
  return ladder;
}

function buildPrompts(step, bucket, signals, answers, answeredIds, chances, suggestion) {
  const prompts = [];

  // Always: step support info
  prompts.push({
    id: `support_step_${step}`,
    type: "info",
    priority: 100,
    title: chances.support.title,
    body: `${chances.support.text} → ${chances.support.action}`,
  });

  // Dynamic questions when still ambiguous
  if (!answeredIds.has("channel") && step <= 3 && bucket.engagement === "low" && bucket.pace === "fast") {
    prompts.push({
      id: "channel",
      type: "question",
      priority: 95,
      title: "Kurz checken",
      body: "Live400: 0% Kauf bei schnellem Verhalten. Was möchten Sie?",
      options: [
        { id: "online", label: "Online abschließen" },
        { id: "advisor", label: "Beraten lassen" },
        { id: "info", label: "Nur informieren" },
      ],
    });
  }

  if (!answeredIds.has("tariff_priority") && step === 3 && (bucket.tarifState === "stuck" || signals.advisoryHovers >= 1) && !bucket.tarif) {
    prompts.push({
      id: "tariff_priority",
      type: "question",
      priority: 90,
      title: "Tarif-Hilfe",
      body: `An Schritt 3 brechen ${stepData(3).reached - stepData(3).purchased} von ${stepData(3).reached} ab. Was ist Ihnen wichtiger?`,
      options: [
        { id: "budget", label: "Günstig online (Start)" },
        { id: "coverage", label: "Maximaler Schutz (evtl. Beratung)" },
        { id: "compare", label: "Noch vergleichen" },
      ],
    });
  }

  if (!answeredIds.has("commitment") && step >= 6 && chances.adjustedPct >= 15) {
    prompts.push({
      id: "commitment",
      type: "question",
      priority: 92,
      title: "Fast geschafft",
      body: `Live400: ${stepData(6).purchasePct}% Kaufchance an Schritt 6. Was hält Sie zurück?`,
      options: [
        { id: "yes", label: "Zu verbindlich online" },
        { id: "price", label: "Preis überrascht" },
        { id: "no", label: "Nichts — weiter" },
      ],
    });
  }

  prompts.push({
    id: "action_suggest",
    type: "action",
    priority: 50,
    title: "Jetzt empfohlen",
    body: suggestion.reason,
    meta: suggestion,
  });

  prompts.sort((a, b) => b.priority - a.priority);
  return prompts;
}

function suggestOption(step, bucket, signals, answers, chances) {
  if (answers.channel === "advisor") {
    return { tarif: null, route: "beratung", label: "Beratung buchen", reason: chances.support.action };
  }
  if (step >= 6 && (answers.commitment === "yes" || chances.topDropReason?.code === "final_price_commitment")) {
    return {
      tarif: bucket.tarif || "optimal",
      route: "online",
      label: "Abschluss absichern",
      reason: "Kein Tarifwechsel — Widerruf & fixer Preis zeigen (live400: 63 Abbrüche wegen Verbindlichkeit).",
      action: "reassure",
    };
  }
  if (step === 3 && (signals.advisoryHovers >= 1 || bucket.tarifState === "stuck")) {
    if (answers.priority === "coverage" || answers.tariff_priority === "coverage") {
      return { tarif: null, route: "beratung", label: "Plus/Premium per Beratung", reason: chances.support.action };
    }
    return { tarif: "start", route: "online", label: "Tarif Start", reason: `Online abschließbar — live400: ${stepData(3).byTarif?.start?.purchasePct ?? 6.4}% Kauf mit Start ab Schritt 3.` };
  }
  if (bucket.tarif === "start") {
    return { tarif: "start", route: "online", label: "Start beibehalten", reason: chances.support.action };
  }
  if (bucket.tarif === "optimal" || step >= 4) {
    return { tarif: "optimal", route: "online", label: "Optimal weiter", reason: chances.support.action };
  }
  return { tarif: "start", route: "online", label: "Tarif Start", reason: chances.support.action };
}

/**
 * @param {{ snap: object, answers?: Record<string, string>, answeredIds?: Set<string> }} opts
 */
export function runLiveCoach({ snap, answers = {}, answeredIds = new Set() }) {
  const signals = extractSignals(snap);
  const bucket = behaviorBucket(snap, signals);
  const step = bucket.step;

  const mappedAnswers = { ...answers };
  if (answers.tariff_priority === "budget") mappedAnswers.priority = "budget";
  if (answers.tariff_priority === "coverage") mappedAnswers.priority = "coverage";
  if (answers.tariff_priority === "compare") mappedAnswers.comparing = "yes";

  const chances = computeStepChances(step, bucket, signals, mappedAnswers);
  const stepLadder = buildStepLadder(step);
  const suggestion = suggestOption(step, bucket, signals, mappedAnswers, chances);
  const prompts = buildPrompts(step, bucket, signals, mappedAnswers, answeredIds, chances, suggestion);

  const liveSignals = {
    step,
    sessionTime: msToReadable(bucket.sessionMs),
    pageDwell: msToReadable(bucket.pageDwellMs),
    sessionMs: bucket.sessionMs,
    pageDwellMs: bucket.pageDwellMs,
    clicks: bucket.clicks,
    cursorMoves: bucket.cursor,
    cursorOnStep: bucket.stepCursor,
    cursorDistancePx: snap.liveOnStep?.cursorDistancePx ?? 0,
    cursorPositionPct: bucket.cursorPositionPct,
    activeHovers: snap.activeHovers || [],
    activeHoverCount: bucket.activeHoverCount,
    advisoryHoverActive: bucket.advisoryHoverActive,
    engagement: bucket.engagement,
    pace: bucket.pace,
    tarifSelected: bucket.tarif || "—",
    tarifDwell: signals.tarifDwellReadable,
    hesitationScore: signals.hesitationScore,
    advisoryHovers: signals.advisoryHovers,
    tarifClicks: signals.tarifClicks,
    backPresses: signals.totalBack,
  };

  return {
    source: STEP_COACH.source,
    step,
    chances,
    stepLadder,
    liveSignals,
    bucket,
    signals,
    suggestion,
    prompts,
    primaryQuestion: prompts.find((p) => p.type === "question") || null,
    dataCollected: { fromTracking: liveSignals, fromAnswers: mappedAnswers },
  };
}

export function mapQuestionAnswer(questionId, optionId) {
  const out = { [questionId]: optionId };
  if (questionId === "tariff_priority") {
    if (optionId === "budget") out.priority = "budget";
    if (optionId === "coverage") out.priority = "coverage";
    if (optionId === "compare") out.comparing = "yes";
  }
  if (questionId === "channel" && optionId === "info") out.channel = "info_only";
  return out;
}

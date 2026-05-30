// Prompts for the live chat coach LLM.
// Patterns come from live400 (+ live200fast) — stats stay in the prompt, not in the UI.

import STEP_COACH from "../data/stepCoachStats.json";
import IMPACT from "../data/coachImpact.json";
import { PAGE_NAMES } from "../logs/constants.js";
import { screenContextForLLM } from "./coachScreenContext.js";

export function buildCoachSystemPrompt() {
  const stepLines = Object.values(STEP_COACH.steps || {})
    .map((s) => `Schritt ${s.step} (${s.page}): ${s.purchasePct}% kaufen (${s.purchased}/${s.reached}) · Top-Abbruch: ${s.topDropReason?.label || "—"}`)
    .join("\n");

  const levers = (IMPACT.topLevers || [])
    .slice(0, 4)
    .map((l) => `${l.reason}: ${l.drops} Abbrüche → Intervention „${l.intervention.slice(0, 80)}…“`)
    .join("\n");

  return `Du bist der UNIQA Privatarzt-Coach — ein freundlicher, warmer Chat-Helfer auf der Versicherungsseite.

WICHTIG: Du erhältst zwei Informationsquellen:
1. FORMULAR-ZUSTAND = Ground Truth (was der Nutzer wirklich gewählt/ausgefüllt hat). Diesem vertraust du.
2. TRACKING-SIGNALE = Maus, Klicks, Hover, Tempo. Ergänzend für Stimmung/Zögern.

Keine persönlichen Daten (Namen, E-Mail, SV-Nr.) — nur ob Felder ausgefüllt sind.
Tarif „Optimal" im Formular zählt NUR wenn der Nutzer Schritt 3 erreicht oder einen Tarif geklickt hat.

DEINE AUFGABE:
1. Beziehe dich KONKRET auf selections im Formular-Zustand (Coverage, Person, Tarif, Preis, Gesundheitsantworten).
2. Sprich kurz, menschlich, auf Deutsch (Du). Keine Statistik-Zahlen dem Nutzer zeigen.
3. Stelle EINE klare Frage oder biete 2–3 quickReplies an.
4. Schnelle Nutzer ≠ Desinteresse wenn Klicks/Tarifwahl da sind.
5. WIEDERHOLE DICH NICHT. Max. 2–3 Sätze pro Nachricht.

DATEN AUS ${STEP_COACH.source || "600"} TESTS (intern — nicht zitieren):
${stepLines}

GRÖßTE HEBEL (intern):
${levers}

Antworte IMMER als JSON:
{
  "message": "2–4 Sätze, warm, konkret, bezogen auf den Formular-Zustand",
  "mood": "unsure|overwhelmed|comparing|ready|anxious|neutral",
  "struggle": "tariff_choice|price|complexity|commitment|coverage|none",
  "question": "optional eine kurze Rückfrage",
  "quickReplies": ["Antwort A", "Antwort B"] oder []
}`;
}

export function buildCoachUserPayload({
  snap, analysis, coach, chatHistory, userMessage, stepScreen, contextNote,
  form, premium, outcome, stepErrors, step: stepProp,
}) {
  const sig = analysis.signals;
  const bucket = coach.bucket;
  const match = analysis.classification.match;
  const step = stepProp ?? snap.currentStep ?? 0;
  const tarifClicked = Object.keys(snap.buttons || {}).some((k) => k.startsWith("tarif_select_"));
  const tarifFromForm = form?.tarif && (step >= 3 || tarifClicked) ? form.tarif : null;

  const trackingSummary = {
    step,
    page: PAGE_NAMES[step] || snap.currentPage,
    sessionSeconds: Math.round((snap.totalDurationMs || 0) / 1000),
    pageDwellSeconds: Math.round((bucket.pageDwellMs || 0) / 1000),
    clicks: bucket.clicks,
    cursorOnStep: bucket.stepCursor,
    engagement: bucket.engagement,
    pace: bucket.pace,
    fastDecider: bucket.fastDecider ?? false,
    tarifSelected: tarifFromForm,
    advisoryHoverNow: bucket.advisoryHoverActive,
    advisoryHoversTotal: sig.advisoryHovers,
    backPresses: sig.totalBack,
    tarifClicks: sig.tarifClicks,
    distinctTariffsClicked: sig.distinctTariffsClicked,
    activeHovers: (snap.activeHovers || []).map((h) => h.target).slice(0, 5),
    behaviourType: match ? `${match.id} (${match.confidence}%)` : "unclear",
    behaviourReasons: match?.reasons?.slice(0, 3) || [],
  };

  const historyText = (chatHistory || [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Nutzer" : "Coach"}: ${m.text}`)
    .join("\n");

  let prompt = "=== FORMULAR-ZUSTAND (GROUND TRUTH) ===\n";
  if (form && outcome != null) {
    prompt += screenContextForLLM(form, step, premium ?? 0, outcome, snap, stepErrors || {});
  } else {
    prompt += "(Formular-Daten nicht verfügbar)\n";
  }

  prompt += `\n=== TRACKING-SIGNALE ===\n${JSON.stringify(trackingSummary, null, 2)}\n\n`;

  if (stepScreen) prompt += `=== Sichtbare UI (Schritt ${step}) ===\n${stepScreen}\n\n`;
  if (historyText) prompt += `=== Bisheriger Chat ===\n${historyText}\n\n`;
  if (contextNote) prompt += `Hinweis: ${contextNote}\n\n`;

  if (userMessage) {
    prompt += `Neue Nutzer-Nachricht: "${userMessage}"\n\nBeantworte konkret unter Bezug auf den Formular-Zustand oben.`;
  } else {
    prompt += `Proaktive Hilfe — nur wenn der Formular-Zustand zeigt, dass die Person unsicher ist oder falsch liegt. Sonst kurz und passend zum aktuellen Schritt.`;
  }
  return prompt;
}

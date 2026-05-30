// Infer end-of-session mood from persona thoughts, drop data, timing, and UI behavior.

const MOOD_LABELS = {
  frustrated: { en: "frustrated", de: "genervt / frustriert" },
  overwhelmed: { en: "overwhelmed", de: "überfordert" },
  anxious: { en: "anxious", de: "ängstlich / unsicher" },
  hesitant: { en: "hesitant", de: "zögernd / unentschlossen" },
  disappointed: { en: "disappointed", de: "enttäuscht" },
  neutral: { en: "neutral", de: "neutral / unklar" },
  cautiously_positive: { en: "cautiously positive", de: "vorsichtig optimistisch" },
  satisfied: { en: "satisfied", de: "zufrieden / erleichtert" },
};

const REASON_MOOD = {
  price_vs_income: { mood: "disappointed", valence: -2, weight: 3 },
  weak_value: { mood: "disappointed", valence: -1, weight: 2 },
  complexity_overwhelm: { mood: "overwhelmed", valence: -2, weight: 3 },
  not_sure_applies: { mood: "hesitant", valence: -1, weight: 2 },
  advisory_wall: { mood: "frustrated", valence: -1, weight: 2 },
  want_to_compare: { mood: "hesitant", valence: 0, weight: 1 },
  prefer_human: { mood: "anxious", valence: -1, weight: 2 },
  data_privacy_fatigue: { mood: "frustrated", valence: -2, weight: 2 },
  final_price_commitment: { mood: "anxious", valence: -1, weight: 3 },
  no_felt_need: { mood: "neutral", valence: 0, weight: 1 },
  other: { mood: "neutral", valence: 0, weight: 1 },
};

const POSITIVE_PATTERNS = [
  { re: /\b(passt|passt mir|gut so|in ordnung|machbar|zufrieden|erleichtert|klar genug|sinnvoll|weiter|bereit|freu|gern so|stimm|okay)\b/i, w: 1 },
  { re: /\b(gut|prima|super|toll|schön)\b/i, w: 0.5 },
];

const NEGATIVE_PATTERNS = [
  { re: /\b(genervt|nervt|nervig|frustriert|ärgerlich)\b/i, w: 2, mood: "frustrated" },
  { re: /\b(überfordert|zu viel|zu viele|kompliziert|unübersichtlich|hickhack)\b/i, w: 2, mood: "overwhelmed" },
  { re: /\b(unsicher|sorge|zögere|zögern|angst|falsch|verbindlich|nicht online)\b/i, w: 2, mood: "anxious" },
  { re: /\b(zu teuer|teuer|budget|leist|geld|preis)\b/i, w: 1.5, mood: "disappointed" },
  { re: /\b(schade|enttäuscht|lohnt|wert)\b/i, w: 1.5, mood: "disappointed" },
  { re: /\b(lang|müde|anstrengend|formular)\b/i, w: 1, mood: "frustrated" },
  { re: /\b(nicht sicher|nochmal|zurück|abbrechen|lieber (anrufen|beratung|telefon))\b/i, w: 1, mood: "hesitant" },
];

function collectText(session, { lastStepOnly = false } = {}) {
  const walk = session.walk || [];
  const entries = lastStepOnly && walk.length ? [walk[walk.length - 1]] : walk;
  const parts = [];
  for (const w of entries) {
    if (w.thoughts) parts.push(w.thoughts);
    if (w.concern) parts.push(w.concern);
    if (w.whyThisOne) parts.push(w.whyThisOne);
    for (const d of w.deliberation || []) parts.push(d);
    for (const r of w.optionReactions || []) {
      if (r.take) parts.push(r.take);
    }
  }
  if (!lastStepOnly && session.stoppedAt?.detail) parts.push(session.stoppedAt.detail);
  if (lastStepOnly && walk.length) {
    const last = walk[walk.length - 1];
    if (last.concern) parts.push(last.concern);
  }
  return parts.join(" ").trim();
}

function reasonCodeOf(session) {
  if (session.stoppedAt?.reasonCode) return session.stoppedAt.reasonCode;
  const last = session.walk?.[session.walk.length - 1];
  return last?.dropReasonCode || "other";
}

function priceShareOf(session) {
  if (typeof session.stoppedAt?.priceShareOfIncomePct === "number") return session.stoppedAt.priceShareOfIncomePct;
  for (let i = (session.walk || []).length - 1; i >= 0; i--) {
    if (typeof session.walk[i].priceShareOfIncomePct === "number") return session.walk[i].priceShareOfIncomePct;
  }
  return null;
}

function scoreText(text) {
  let valence = 0;
  const moodScores = {};
  for (const { re, w } of POSITIVE_PATTERNS) {
    const hits = (text.match(new RegExp(re.source, "gi")) || []).length;
    if (hits) valence += w * Math.min(hits, 3);
  }
  for (const { re, w, mood } of NEGATIVE_PATTERNS) {
    const hits = (text.match(new RegExp(re.source, "gi")) || []).length;
    if (hits) {
      valence -= w * Math.min(hits, 3);
      if (mood) moodScores[mood] = (moodScores[mood] || 0) + w * hits;
    }
  }
  return { valence, moodScores };
}

function clampValence(v) {
  return Math.max(-2, Math.min(2, Math.round(v)));
}

function pickTopMood(scores, fallback = "neutral") {
  const entries = Object.entries(scores).filter(([, v]) => v > 0);
  if (!entries.length) return fallback;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function buildSummary(session, mood, valence, drivers) {
  const name = session.persona?.name?.split(" ")[0] || "They";
  const status = session.status;
  const lastPage = session.stoppedAt?.page || "the funnel";
  const topDriver = drivers[0];

  if (status === "completed_online") {
    if (valence >= 1) return `${name} finished feeling relieved — the process matched what they needed.`;
    return `${name} completed the purchase but still sounded cautious at the end.`;
  }
  if (mood === "disappointed") {
    return `${name} left disappointed, mostly around cost or value at "${lastPage}".`;
  }
  if (mood === "overwhelmed") {
    return `${name} felt overwhelmed by choices or length and stopped at "${lastPage}".`;
  }
  if (mood === "anxious") {
    return `${name} stopped feeling uneasy about committing online at "${lastPage}".`;
  }
  if (mood === "frustrated") {
    return `${name} ended frustrated — ${topDriver || "too much friction in the flow"}.`;
  }
  if (mood === "hesitant") {
    return `${name} stayed hesitant and chose not to continue at "${lastPage}".`;
  }
  return `${name} left with a mixed/neutral mood at "${lastPage}".`;
}

function buildSummaryDe(session, mood, drivers) {
  const lastPage = session.stoppedAt?.page || "dem Formular";
  const topDriver = drivers[0];
  const map = {
    satisfied: `Am Ende zufrieden — der Abschluss hat sich stimmig angefühlt.`,
    cautiously_positive: `Hat zwar abgeschlossen, klingt aber noch vorsichtig.`,
    disappointed: `Enttäuscht vor allem wegen Preis oder Gegenwert bei „${lastPage}".`,
    overwhelmed: `Überfordert von zu vielen Optionen oder zu langem Ablauf.`,
    anxious: `Unsicher beim finalen Schritt — lieber nicht online verbindlich abschließen.`,
    frustrated: `Genervt: ${topDriver || "zu viel Reibung im Ablauf"}.`,
    hesitant: `Zögernd und unentschlossen bei „${lastPage}".`,
    neutral: `Neutral bis gemischt — kein klares positives oder negatives Gefühl.`,
  };
  return map[mood] || map.neutral;
}

/**
 * @param {object} session - full persona session JSON (offline or live_ui)
 * @returns {object} mood block
 */
export function analyzeMood(session) {
  const focusLastStep = session.status === "completed_online";
  const text = collectText(session, { lastStepOnly: focusLastStep });
  const { valence: textValence, moodScores } = scoreText(text);
  const drivers = [];

  let valence = textValence;
  const moodWeights = { ...moodScores };

  const reasonCode = reasonCodeOf(session);
  const reasonCfg = REASON_MOOD[reasonCode] || REASON_MOOD.other;
  moodWeights[reasonCfg.mood] = (moodWeights[reasonCfg.mood] || 0) + reasonCfg.weight;
  valence += reasonCfg.valence * 0.5;
  if (reasonCode !== "other") drivers.push(`drop reason: ${reasonCode}`);

  const tel = session.telemetry?.summary || {};
  const backPresses = tel.backPresses ?? tel.backButtonClicks ?? 0;
  if (backPresses > 0) {
    moodWeights.hesitant = (moodWeights.hesitant || 0) + backPresses * 0.8;
    moodWeights.frustrated = (moodWeights.frustrated || 0) + backPresses * 0.4;
    valence -= 0.3;
    drivers.push(`${backPresses} back navigation(s)`);
  }

  const humanMs = session.timeModel?.humanEquivalentTotalMs;
  if (typeof humanMs === "number" && humanMs > 480000) {
    moodWeights.overwhelmed = (moodWeights.overwhelmed || 0) + 1.5;
    valence -= 0.4;
    drivers.push("long session (8+ min human-equivalent)");
  }

  const lastWalk = session.walk?.[session.walk.length - 1];
  const lastHumanMs = lastWalk?.humanEquivalentMs ?? lastWalk?.intendedHumanMs;
  if (typeof lastHumanMs === "number" && lastHumanMs > 90000 && session.status === "dropped") {
    moodWeights.anxious = (moodWeights.anxious || 0) + 1.2;
    moodWeights.hesitant = (moodWeights.hesitant || 0) + 0.8;
    drivers.push("long deliberation on exit step");
  }

  const share = priceShareOf(session);
  if (typeof share === "number" && share >= 4) {
    moodWeights.disappointed = (moodWeights.disappointed || 0) + 1 + (share >= 6 ? 0.5 : 0);
    valence -= 0.5;
    drivers.push(`premium ≈ ${share}% of monthly income`);
  }

  let mood;
  if (session.status === "completed_online") {
    const anxiousLast = /\b(unsicher|zögere|zögern|falsch|bedenken|lieber nicht online)\b/i.test(text);
    mood = anxiousLast || textValence < -3 ? "cautiously_positive" : "satisfied";
    valence = mood === "satisfied" ? 1 : 0;
    drivers.unshift("completed online purchase");
  } else if (session.status === "out_of_scope") {
    mood = pickTopMood(moodWeights, "neutral");
    if (mood === "neutral") valence = Math.min(valence, 0);
    drivers.unshift(`out of scope: ${session.stoppedAt?.reason || "advisory route"}`);
  } else {
    mood = pickTopMood(moodWeights, reasonCfg.mood);
  }

  valence = clampValence(valence);
  const intensity = Math.min(
    5,
    Math.max(1, Math.round(Object.values(moodWeights).reduce((a, b) => a + b, 0) / 2 + Math.abs(valence))),
  );

  const labels = MOOD_LABELS[mood] || MOOD_LABELS.neutral;
  const uniqueDrivers = [...new Set(drivers)].slice(0, 5);

  return {
    label: labels.en,
    labelDe: labels.de,
    valence,
    intensity,
    summary: buildSummary(session, mood, valence, uniqueDrivers),
    summaryDe: buildSummaryDe(session, mood, uniqueDrivers),
    drivers: uniqueDrivers,
    signals: {
      reasonCode,
      textValence: Math.round(textValence * 10) / 10,
      humanEquivalentTotalMs: humanMs ?? null,
      backPresses,
      priceShareOfIncomePct: share,
    },
  };
}

export { MOOD_LABELS };

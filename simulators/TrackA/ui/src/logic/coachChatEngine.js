// Orchestrates live chat coach: tracking analysis (background) + LLM conversation.

import { analyzeSession } from "./personaClassifier.js";
import { runLiveCoach } from "./liveCoachEngine.js";
import { buildCoachSystemPrompt, buildCoachUserPayload } from "./coachChatPrompts.js";

const SYSTEM = buildCoachSystemPrompt();

const MOODS = new Set(["unsure", "overwhelmed", "comparing", "ready", "anxious", "neutral"]);
const STRUGGLES = new Set(["tariff_choice", "price", "complexity", "commitment", "coverage", "none"]);

function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Some models wrap the message in { text } or return arrays of strings.
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(" ");
  if (typeof v === "object") return asText(v.text ?? v.message ?? v.value ?? "");
  return "";
}

function sanitizeQuickReplies(v) {
  if (!Array.isArray(v)) {
    if (typeof v === "string" && v.trim()) return [v.trim().slice(0, 60)];
    return [];
  }
  return v
    .map((o) => (typeof o === "string" ? o : asText(o)))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((s) => s.slice(0, 60));
}

function normalizeCoach(obj) {
  const message = asText(obj.message) || "Wie kann ich Ihnen bei diesem Schritt helfen?";
  const question = asText(obj.question) || null;
  const mood = MOODS.has(obj.mood) ? obj.mood : "neutral";
  const struggle = STRUGGLES.has(obj.struggle) ? obj.struggle : "none";
  return { message, question, mood, struggle, quickReplies: sanitizeQuickReplies(obj.quickReplies) };
}

function parseCoachJSON(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return normalizeCoach(JSON.parse(t)); } catch { /* fall through */ }
  const s = t.search(/\{/);
  const end = t.lastIndexOf("}");
  if (s >= 0 && end > s) {
    try { return normalizeCoach(JSON.parse(t.slice(s, end + 1))); } catch { /* fall through */ }
  }
  // Last resort: treat raw text as the message so the user still gets something.
  return normalizeCoach({ message: t });
}

export async function requestCoachReply({
  snap,
  answers = {},
  chatHistory = [],
  userMessage = null,
  stepScreen = null,
  contextNote = null,
  form = null,
  premium = null,
  outcome = null,
  stepErrors = null,
  step = null,
}) {
  const analysis = analyzeSession(snap);
  const coach = runLiveCoach({ snap, answers, answeredIds: new Set(Object.keys(answers)) });
  const userPayload = buildCoachUserPayload({
    snap,
    analysis,
    coach,
    chatHistory,
    userMessage,
    stepScreen,
    contextNote,
    form,
    premium,
    outcome,
    stepErrors,
    step: step ?? snap.currentStep,
  });

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 25000);
  let res;
  try {
    res = await fetch("/api/coach-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        temperature: 0.72,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPayload },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    throw new Error(e.name === "AbortError" ? "Coach-Antwort hat zu lange gedauert." : e.message);
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || err.error || `Coach API ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const parsed = parseCoachJSON(raw);

  return {
    ...parsed,
    _dev: {
      analysis,
      coach,
      purchasePct: coach.chances.adjustedPct,
      mood: parsed.mood,
      struggle: parsed.struggle,
    },
  };
}

/** @deprecated — proactive gating moved to coachProactive.js */
export function trackingFingerprint() {
  return "";
}

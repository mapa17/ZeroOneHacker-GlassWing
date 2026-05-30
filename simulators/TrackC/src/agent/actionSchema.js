/** Per-step action types and JSON parser for the interactive user agent. */

import { SV_OPTIONS } from "../data/product.js";
import { validateFocusedAction, focusedActionHintForStep } from "./focusedMode.js";

// Selection actions update the form but do NOT advance the step.
// Use { "action": "proceed" } as a separate action to click "Weiter" and move forward.
// This mirrors the real web form where selection and Weiter are separate interactions.
const ACTION_HINTS = {
  0: `{ "action": "select_coverage", "arzt": true|false, "krankenhaus": true|false } — then { "action": "proceed" } to advance`,
  1: `{ "action": "select_insured_person", "insuredPerson": "myself"|"others" } — then { "action": "proceed" } to advance`,
  2: `{ "action": "fill_fields", "geburtsdatum"?: "TT.MM.JJJJ", "sozialversicherung"?: "ÖGK"|"BVAEB"|"SVS"|"KFA"|"Sonstige" } — partial updates OK — then { "action": "proceed" } to advance`,
  3: `{ "action": "select_tarif", "tarif": "start"|"optimal"|"optplus"|"premium" } — then { "action": "proceed" } to advance, or { "action": "back" }`,
  4: `{ "action": "toggle_addons", "addons": { "fit": bool, "eltern": bool, "mental": bool, "akut": bool, "baby": bool, "vital": bool } } — then { "action": "proceed" } to advance, or { "action": "back" }`,
  5: `{ "action": "fill_fields", ...any personal fields... } — partial updates OK — then { "action": "proceed" } to advance, or { "action": "back" }`,
  6: `{ "action": "fill_fields", "privatVersichert7"?: "ja"|"nein", "antraegeAbgelehnt"?: "ja"|"nein", "besondereAnnahme"?: "ja"|"nein" } — then { "action": "proceed" } to advance, or { "action": "back" }`,
  7: `{ "action": "fill_fields", "beratungsort": "Online Videoberatung"|"Persönlich an einem UNIQA-Standort"|"Per Telefon"|"Persönlich zu Hause" } — then { "action": "proceed" } to advance, or { "action": "back" }`,
};

const FILL_FIELDS_BY_STEP = {
  2: ["geburtsdatum", "sozialversicherung"],
  5: ["geschlecht", "vorname", "name", "svnummer", "email", "telefon", "groesse", "gewicht", "leistungssport", "schwangerschaft"],
  6: ["privatVersichert7", "antraegeAbgelehnt", "besondereAnnahme"],
  7: ["beratungsort"],
};

const GESCHLECHT = ["männlich", "weiblich", "divers"];
const JA_NEIN = ["ja", "nein"];
const BERATUNGSORT = [
  "Online Videoberatung",
  "Persönlich an einem UNIQA-Standort",
  "Per Telefon",
  "Persönlich zu Hause",
];

export function actionHintForStep(step, { focusedMode = false } = {}) {
  if (focusedMode) {
    const focused = focusedActionHintForStep(step);
    if (focused) return focused;
  }
  return ACTION_HINTS[step] || `{ "action": "leave", "reason": "..." }`;
}

function extractJson(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const s = t.search(/[\[{]/);
  const end = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (s >= 0 && end > s) {
    try { return JSON.parse(t.slice(s, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

function validateFillFields(obj, step) {
  const allowed = FILL_FIELDS_BY_STEP[step];
  if (!allowed) return { ok: false, error: `fill_fields not allowed on step ${step}` };

  const provided = allowed.filter((k) => obj[k] != null && obj[k] !== "");
  if (provided.length === 0) return { ok: false, error: "fill_fields requires at least one field for this step" };

  for (const key of provided) {
    const val = obj[key];
    if (key === "sozialversicherung" && !SV_OPTIONS.includes(val)) {
      return { ok: false, error: `invalid sozialversicherung (use ${SV_OPTIONS.join("|")})` };
    }
    if (key === "geschlecht" && !GESCHLECHT.includes(val)) {
      return { ok: false, error: "invalid geschlecht" };
    }
    if (["leistungssport", "schwangerschaft", "privatVersichert7", "antraegeAbgelehnt", "besondereAnnahme"].includes(key) && !JA_NEIN.includes(val)) {
      return { ok: false, error: `${key} must be ja|nein` };
    }
    if (key === "beratungsort" && !BERATUNGSORT.includes(val)) {
      return { ok: false, error: "invalid beratungsort" };
    }
  }
  return { ok: true, action: obj };
}

function validateAction(obj, step, { focusedMode = false, coachEnabled = false } = {}) {
  if (!obj || typeof obj !== "object") return { ok: false, error: "Not an object" };
  const action = obj.action;

  if (action === "message_coach") {
    if (!coachEnabled) return { ok: false, error: "message_coach is not available" };
    if (!obj.message || typeof obj.message !== "string") {
      return { ok: false, error: "message_coach requires a non-empty message string" };
    }
    return { ok: true, action: obj };
  }
  if (action === "continue_thinking") {
    return { ok: true, action: obj };
  }
  if (action === "pause") {
    if (!obj.reason) return { ok: false, error: "pause requires reason" };
    return { ok: true, action: obj };
  }
  if (action === "leave") {
    if (!obj.reason) return { ok: false, error: "leave requires reason" };
    return { ok: true, action: obj };
  }
  if (action === "proceed") {
    if (step >= 8) return { ok: false, error: "proceed not valid on step 8" };
    return { ok: true, action: obj };
  }
  if (action === "back") {
    if (![3, 4, 5, 6, 7].includes(step)) return { ok: false, error: "back not allowed on this step" };
    return { ok: true, action: obj };
  }
  if (step === 0 && action === "select_coverage") {
    if (!obj.arzt && !obj.krankenhaus) return { ok: false, error: "select at least one coverage" };
    const focusedErr = validateFocusedAction(step, obj, focusedMode);
    if (focusedErr) return { ok: false, error: focusedErr };
    return { ok: true, action: obj };
  }
  if (step === 1 && action === "select_insured_person") {
    if (!["myself", "others"].includes(obj.insuredPerson)) return { ok: false, error: "invalid insuredPerson" };
    const focusedErr = validateFocusedAction(step, obj, focusedMode);
    if (focusedErr) return { ok: false, error: focusedErr };
    return { ok: true, action: obj };
  }
  if (step === 2 && action === "fill_fields") return validateFillFields(obj, step);
  if (step === 3 && action === "select_tarif") {
    if (!["start", "optimal", "optplus", "premium"].includes(obj.tarif)) return { ok: false, error: "invalid tarif" };
    const focusedErr = validateFocusedAction(step, obj, focusedMode);
    if (focusedErr) return { ok: false, error: focusedErr };
    return { ok: true, action: obj };
  }
  if (step === 4 && action === "toggle_addons") {
    if (!obj.addons || typeof obj.addons !== "object") return { ok: false, error: "addons object required" };
    return { ok: true, action: obj };
  }
  if ((step === 5 || step === 6 || step === 7) && action === "fill_fields") {
    const focusedErr = validateFocusedAction(step, obj, focusedMode);
    if (focusedErr) return { ok: false, error: focusedErr };
    return validateFillFields(obj, step);
  }
  return { ok: false, error: `action "${action}" not valid for step ${step}` };
}

export function parseAction(rawText, step, options = {}) {
  const obj = extractJson(rawText);
  if (!obj) return { ok: false, error: "Could not parse JSON", action: null };
  return validateAction(obj, step, options);
}

export function retryPrompt(parseError, step, options = {}) {
  return `Your previous reply was invalid: ${parseError}. Reply ONLY with valid JSON for step ${step} — always include a "begruendung" field. Examples: { "action": "proceed", "begruendung": "..." } to advance, or ${actionHintForStep(step, options).split(" — ")[0]}, "begruendung": "..." } to update your selection, or { "action": "back", "begruendung": "..." } or { "action": "pause", "reason": "...", "begruendung": "..." }`;
}

/** Per-step action types and JSON parser for the interactive user agent. */

import { SV_OPTIONS } from "../data/product.js";
import { validateFocusedAction, focusedActionHintForStep } from "./focusedMode.js";

const ACTION_HINTS = {
  0: `{ "action": "select_coverage", "arzt": true|false, "krankenhaus": true|false }`,
  1: `{ "action": "select_insured_person", "insuredPerson": "myself"|"others" }`,
  2: `{ "action": "fill_fields", "geburtsdatum"?: "TT.MM.JJJJ", "sozialversicherung"?: "ÖGK"|"BVAEB"|"SVS"|"KFA"|"Sonstige" } — partial updates OK; form validates before advance`,
  3: `{ "action": "select_tarif", "tarif": "start"|"optimal"|"optplus"|"premium" } OR { "action": "back" }`,
  4: `{ "action": "toggle_addons", "addons": { "fit": bool, "eltern": bool, "mental": bool, "akut": bool, "baby": bool, "vital": bool } } OR { "action": "back" }`,
  5: `{ "action": "fill_fields", ...any personal fields... } — partial updates OK; all required fields must be valid before advance`,
  6: `{ "action": "fill_fields", "privatVersichert7"?: "ja"|"nein", "antraegeAbgelehnt"?: "ja"|"nein", "besondereAnnahme"?: "ja"|"nein" }`,
  7: `{ "action": "fill_fields", "beratungsort": "Online Videoberatung"|"Persönlich an einem UNIQA-Standort"|"Per Telefon"|"Persönlich zu Hause" }`,
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

function validateAction(obj, step, { focusedMode = false } = {}) {
  if (!obj || typeof obj !== "object") return { ok: false, error: "Not an object" };
  const action = obj.action;

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
  return `Your previous reply was invalid: ${parseError}. Reply ONLY with valid JSON for step ${step}. Example: ${actionHintForStep(step, options)} or { "action": "pause", "reason": "..." } or { "action": "continue_thinking" } or { "action": "leave", "reason": "..." }`;
}

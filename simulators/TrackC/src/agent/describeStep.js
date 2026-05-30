import { PAGE_NAMES } from "../logs/constants.js";
import { TARIFFS, ADDONS, SV_OPTIONS, COVERAGE_OPTIONS, INSURED_PERSON_OPTIONS } from "../data/product.js";
import { fmt, canProceedFromStep, formatValidationBlock } from "../logic/form.js";
import { actionHintForStep } from "./actionSchema.js";
import { describeCoachForStep, coachActionBlock } from "./coachState.js";
import { describeProfileHintsForStep } from "./profileStepHints.js";
import { exitBehaviorRulesBlock } from "./exitClassification.js";
import {
  focusedModeBanner,
  focusedStepOptions,
  isStepRestrictedInFocusedMode,
} from "./focusedMode.js";

function selectedAddons(form) {
  return ADDONS.filter((a) => form.addons[a.key]).map((a) => `${a.name} (+${fmt(a.price)})`);
}

function stepOptions(step, { focusedMode = false } = {}) {
  if (focusedMode && isStepRestrictedInFocusedMode(step)) {
    const focused = focusedStepOptions(step);
    if (focused) return focused;
  }
  switch (step) {
    case 0:
      return COVERAGE_OPTIONS.map((o) => `- ${o.key}: ${o.title}`).join("\n");
    case 1:
      return INSURED_PERSON_OPTIONS.map((o) => `- ${o.key}: ${o.title}`).join("\n");
    case 2:
      return `Fields: geburtsdatum (TT.MM.JJJJ), sozialversicherung (${SV_OPTIONS.join(" | ")})`;
    case 3:
      return TARIFFS.map((t) =>
        `- ${t.key}: ${t.name} — ${fmt(t.premium)}/month — ${t.badge}${t.online ? "" : " (advisory required)"}`
      ).join("\n");
    case 4:
      return ADDONS.map((a) => `- ${a.key}: ${a.name} (+${fmt(a.price)}) — ${a.desc}`).join("\n");
    case 5:
      return "Fields: geschlecht, vorname, name, svnummer (10 digits), email, telefon, groesse, gewicht, leistungssport (ja|nein), schwangerschaft (ja|nein)";
    case 6:
      return "Fields: privatVersichert7 (ja|nein), antraegeAbgelehnt (ja|nein), besondereAnnahme (ja|nein)";
    case 7:
      return "Fields: beratungsort (Online Videoberatung | Persönlich an einem UNIQA-Standort | Per Telefon | Persönlich zu Hause)";
    case 8:
      return "Funnel complete — no action needed.";
    default:
      return "";
  }
}

function currentSelections(form, step, premium) {
  const lines = [];
  if (form.coverage.arzt || form.coverage.krankenhaus) {
    lines.push(`Coverage: arzt=${form.coverage.arzt}, krankenhaus=${form.coverage.krankenhaus}`);
  }
  if (form.insuredPerson) lines.push(`Insured person: ${form.insuredPerson}`);
  if (form.geburtsdatum) lines.push(`Birth date: ${form.geburtsdatum}, SV: ${form.sozialversicherung || "—"}`);
  if (form.tarif && step >= 3) lines.push(`Selected tariff: ${form.tarif}`);
  if (step >= 4) {
    const addons = selectedAddons(form);
    lines.push(`Addons: ${addons.length ? addons.join(", ") : "none"}`);
  }
  if (form.vorname && step >= 5) lines.push(`Name: ${form.vorname} ${form.name}`);
  if (premium != null && step >= 3) lines.push(`Current monthly premium: ${fmt(premium)}`);
  return lines.join("\n");
}

/** Build the exact user message sent to the LLM for the current funnel step. */
export function describeStep({ step, form, coachState, premium, profile, validationErrors, canProceed, focusedMode = false, coachEnabled = false }) {
  const coachBlock = describeCoachForStep(coachState);
  const coachActions = coachEnabled ? coachActionBlock() : "";
  const profileLine = profile
    ? `You are: ${profile.persona_name}, age ${profile.demographics?.age}, archetype ${profile.archetype_name}.\n`
    : "";

  const proceed = canProceed ?? canProceedFromStep(step, form);
  const errorLines = formatValidationBlock(validationErrors);

  let validationBlock = "";
  if (errorLines) {
    validationBlock = `
## Validation errors (you cannot proceed yet)
${errorLines}

## Note
The form cannot advance until all errors above are resolved. Fix fields, use continue_thinking to hesitate, pause to defer, or leave only for permanent abandon.
`;
  } else if (!proceed && step !== 8) {
    validationBlock = `
## Form status
You cannot proceed yet — required fields for this step are incomplete or invalid (same rules as the web form Continue button).
`;
  } else if (proceed && step !== 8) {
    validationBlock = `
## Form status
All required fields for this step are valid — your action will advance to the next step (unless you pause or leave permanently).
`;
  }

  const profileHintsBlock = describeProfileHintsForStep(step, profile, form);
  const focusedBlock = focusedMode && isStepRestrictedInFocusedMode(step) ? focusedModeBanner() : "";

  return `${profileLine}You are on funnel step ${step} — ${PAGE_NAMES[step] || "Unknown"}.

## What you see on this page
${stepOptions(step, { focusedMode })}
${profileHintsBlock}
${focusedBlock}

## Your selections so far
${currentSelections(form, step, premium) || "(none yet)"}
${coachBlock}${validationBlock}

## Your task
Each step works in two separate actions — just like the real form:
1. First make your selection (select_coverage, select_tarif, fill_fields, toggle_addons).
   The coach may send you a message after your selection — read it and decide whether to change your choice.
2. Then send { "action": "proceed" } to click "Weiter" and advance to the next step.
   Only proceed when you are satisfied with your selection.
You can also go back, pause, or leave at any point.

Reply with a single JSON object — no markdown, no prose outside the JSON.
Always include a "begruendung" field (string) with your reasoning in German.

Example (selection turn): { "action": "select_tarif", "tarif": "optimal", "begruendung": "Optimal deckt die wichtigsten Leistungen ab und passt zum Budget." }
Example (proceed turn):    { "action": "proceed", "begruendung": "Auswahl passt — ich gehe weiter." }

Allowed action for this step:
${actionHintForStep(step, { focusedMode })}
${exitBehaviorRulesBlock()}${coachActions}`;
}

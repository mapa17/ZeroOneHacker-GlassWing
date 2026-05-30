import { TARIFFS, COVERAGE_OPTIONS, INSURED_PERSON_OPTIONS } from "../data/product.js";
import { fmt } from "../logic/form.js";

/** Steps 0–6: online-only choices. Step 7+ (Beratungsort / Ergebnis) allows advisor paths. */
export const FOCUSED_MODE_ADVISOR_FROM_STEP = 7;

export function isStepRestrictedInFocusedMode(step) {
  return step < FOCUSED_MODE_ADVISOR_FROM_STEP;
}

export function focusedModeBanner() {
  return `
## Focused mode (online funnel only)
Only choices that keep the online flow are available on steps 0–6. Advisor-routing options (Krankenhaus, other persons, Opt. Plus/Premium, prior-insurance "ja") are hidden until step 7. You may still \`pause\` or \`leave\`.`;
}

/** Page options shown to the model in focused mode. */
export function focusedStepOptions(step) {
  switch (step) {
    case 0:
      return COVERAGE_OPTIONS.filter((o) => o.key === "arzt")
        .map((o) => `- ${o.key}: ${o.title} (online path only)`)
        .join("\n");
    case 1:
      return INSURED_PERSON_OPTIONS.filter((o) => o.key === "myself")
        .map((o) => `- ${o.key}: ${o.title}`)
        .join("\n");
    case 3:
      return TARIFFS.filter((t) => t.online)
        .map((t) => `- ${t.key}: ${t.name} — ${fmt(t.premium)}/month — ${t.badge}`)
        .join("\n");
    case 6:
      return "Fields: privatVersichert7 (nein only), antraegeAbgelehnt (nein only), besondereAnnahme (nein only) — \"ja\" routes to advisor and is not available yet";
    default:
      return null;
  }
}

/** Reject advisor-routing actions in focused mode (steps 0–6). Returns error string or null. */
export function validateFocusedAction(step, action, focusedMode) {
  if (!focusedMode || !isStepRestrictedInFocusedMode(step) || !action) return null;

  switch (action.action) {
    case "select_coverage":
      if (action.krankenhaus) {
        return "krankenhaus is not available in focused mode (routes to advisor) — use arzt: true, krankenhaus: false";
      }
      if (!action.arzt) {
        return "select arzt: true in focused mode";
      }
      break;
    case "select_insured_person":
      if (action.insuredPerson === "others") {
        return "insuredPerson \"others\" is not available in focused mode — use \"myself\"";
      }
      break;
    case "select_tarif":
      if (action.tarif === "optplus" || action.tarif === "premium") {
        return "optplus/premium are not available in focused mode — use start or optimal";
      }
      break;
    case "fill_fields":
      if (step === 6) {
        for (const key of ["privatVersichert7", "antraegeAbgelehnt", "besondereAnnahme"]) {
          if (action[key] === "ja") {
            return `${key} \"ja\" is not available in focused mode (routes to advisor) — use \"nein\"`;
          }
        }
      }
      break;
    default:
      break;
  }
  return null;
}

export function focusedActionHintForStep(step) {
  switch (step) {
    case 0:
      return `{ "action": "select_coverage", "arzt": true, "krankenhaus": false }`;
    case 1:
      return `{ "action": "select_insured_person", "insuredPerson": "myself" }`;
    case 3:
      return `{ "action": "select_tarif", "tarif": "start"|"optimal" } OR { "action": "back" }`;
    case 6:
      return `{ "action": "fill_fields", "privatVersichert7"?: "nein", "antraegeAbgelehnt"?: "nein", "besondereAnnahme"?: "nein" } — only "nein" allowed here`;
    default:
      return null;
  }
}

import { SV_OPTIONS } from "../data/product.js";

/** Deterministic RNG from profile sample_id so hints are stable per persona. */
function rngFromProfile(profile) {
  let s = (profile.sample_id ?? 1) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function birthDateFromAge(age, rng) {
  const year = new Date().getFullYear() - age;
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

/** Heuristic SV pick from profile — most employed Austrians use ÖGK. */
export function suggestSozialversicherung(profile) {
  const summary = (profile.behavioral_summary || "").toLowerCase();
  const quote = (profile.typical_quote || "").toLowerCase();
  const text = `${summary} ${quote}`;

  if (text.includes("selbstständig") || text.includes("self-employed") || text.includes("freelance")) {
    return "SVS";
  }
  if (text.includes("landwirt") || text.includes("farmer") || profile.persona_id === "segment_3") {
    return rngFromProfile(profile)() < 0.4 ? "KFA" : "ÖGK";
  }
  if (text.includes("beamte") || text.includes("public sector") || text.includes("öffentlich")) {
    return "BVAEB";
  }
  return "ÖGK";
}

/** Step 2 field suggestions derived from the sampled persona profile. */
export function step2HintsFromProfile(profile, form = {}) {
  if (!profile?.demographics?.age) return null;

  const age = profile.demographics.age;
  const rng = rngFromProfile(profile);
  const geburtsdatum = birthDateFromAge(age, rng);
  const sozialversicherung = suggestSozialversicherung(profile);
  const birthYear = new Date().getFullYear() - age;

  return {
    age,
    birthYear,
    geburtsdatum,
    sozialversicherung,
    needsGeburtsdatum: !form.geburtsdatum,
    needsSozialversicherung: !form.sozialversicherung,
  };
}

/** Prompt block for step 2 — gives the LLM concrete values to enter. */
export function describeProfileHintsForStep(step, profile, form) {
  if (step !== 2 || !profile) return "";

  const hints = step2HintsFromProfile(profile, form);
  if (!hints) return "";

  const lines = [
    "",
    "## What you know from your profile (fictional simulation — use these to fill the form)",
    `You are simulating ${profile.persona_name}, age ${hints.age}. This is not real PII — use plausible values consistent with your profile.`,
  ];

  if (hints.needsGeburtsdatum) {
    lines.push(`- Birth year from your age: approximately ${hints.birthYear} → use geburtsdatum "${hints.geburtsdatum}" (format TT.MM.JJJJ)`);
  }
  if (hints.needsSozialversicherung) {
    lines.push(`- Sozialversicherung for your situation: "${hints.sozialversicherung}" (options: ${SV_OPTIONS.join(", ")})`);
  }
  if (!hints.needsGeburtsdatum && !hints.needsSozialversicherung) {
    return "";
  }

  lines.push(
    "- Enter these with `{ \"action\": \"fill_fields\", ... }` — you have the information; do not pause or leave just because fields are empty.",
    "- Use `continue_thinking` if you need a moment on this page; use `pause` if you will come back later.",
    "- Use `leave` only for genuine permanent abandon (distrust, frustration) — not for checking data you already have.",
  );

  return lines.join("\n");
}

// Optional GPT enrichment for the test runner.
//
// The behavioural telemetry (dwell, hovers, cursor, back-presses) is produced by
// the calibrated simulator — that's what makes the STATISTICS accurate. GPT does
// NOT generate telemetry; its job here is to make each session file feel like a
// distinct real person: a concrete persona instance (name, age, situation) and a
// short first-person intent narrative consistent with the segment.
//
// Enabled only when --gpt is passed AND OPENAI_API_KEY is available. Reads a
// .env file at repo root if present (no external dependency).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("OPENAI_API_KEY="));
    if (line) return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

const KEY = loadEnvKey();
export const getOpenAIModel = () => process.env.OPENAI_MODEL || "gpt-5.4-mini";
const MODEL = getOpenAIModel();
let warned = false;

export function hasOpenAIKey() {
  return !!KEY;
}

/** Multi-turn chat completion for interactive agent loop. */
export async function chatCompletion({ system, messages, temperature = 0.7 }) {
  if (!KEY) throw new Error("No OPENAI_API_KEY found (.env or env).");

  const apiMessages = [];
  if (system) apiMessages.push({ role: "system", content: system });
  apiMessages.push(...messages);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature, messages: apiMessages }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return { model: MODEL, text: data.choices?.[0]?.message?.content || "" };
}

/**
 * Send a fully-rendered prompt to the chat completions API and return the raw
 * text. Used to turn a filled persona_prompt_template into a system prompt.
 */
export async function generateText(prompt, { temperature = 0.7, system = null } = {}) {
  if (!KEY) throw new Error("No OPENAI_API_KEY found (.env or env).");

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature, messages }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return { model: MODEL, text: data.choices?.[0]?.message?.content || "" };
}

export async function maybeEnrich(persona, seed, profile = null) {
  if (!KEY) {
    if (!warned) {
      warned = true;
      console.warn("  ⚠ --gpt set but no OPENAI_API_KEY found (.env or env). Skipping enrichment.");
    }
    return null;
  }

  // When the sampled profile is available, feed its concrete attributes so the
  // generated narrative is consistent with THIS person (not just the archetype).
  const profileBlock = profile
    ? `\nSampled attributes (stay consistent with these):\n` +
      `- age ${profile.demographics?.age}, ${profile.demographics?.gender}, ${profile.demographics?.urbanity}\n` +
      `- household ${profile.demographics?.household_type}, education ${profile.demographics?.education}\n` +
      `- income €${profile.demographics?.income_monthly_eur}/mo (${profile.demographics?.income_label})\n` +
      `- owns: ${(profile.insurance_behavior?.owned_products || []).join(", ") || "—"}\n` +
      `- top decision drivers: ${(profile.top_decision_drivers || []).join(", ") || "—"}\n`
    : "";

  const system =
    "You generate a single realistic Austrian insurance shopper that fits a given UNIQA customer segment " +
    "and the provided sampled attributes. Reply ONLY with compact JSON, no prose.";
  const user =
    `Segment: ${persona.segment}\n` +
    `Archetype: ${persona.name}, age ~${persona.age}\n` +
    `Quote: "${persona.quote}"\n` +
    `Behaviour: ${persona.oneLiner}\n` +
    profileBlock +
    `\nProduce JSON with keys: firstName, lastName, age (int), city, occupation, ` +
    `householdSituation, riskAttitude, onlineComfort (1-5), intent (one sentence, first person), ` +
    `whyMightDropOff (one sentence). Make it plausible and varied (seed ${seed}).`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.9,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`  ⚠ OpenAI ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    return { source: MODEL, ...JSON.parse(text) };
  } catch (e) {
    console.warn(`  ⚠ GPT enrichment failed: ${e.message}`);
    return null;
  }
}

/** Ask GPT to fill the funnel form as a specific sampled profile (agent mode). */
export async function fillFormFromProfile(profile, persona, seed) {
  if (!KEY) return null;

  const system =
    "You fill a UNIQA Austrian private health insurance quote form as the given person. " +
    "Choose tariff, addons, and health answers consistent with their demographics, income, and attitudes. " +
    "Reply ONLY with compact JSON matching the requested schema.";

  const user =
    `Segment archetype: ${persona.name} (${persona.segment})\n` +
    `Sampled person:\n${JSON.stringify(profile, null, 0)}\n\n` +
    `Return JSON:\n` +
    `{"coverage":{"arzt":true,"krankenhaus":bool},"insuredPerson":"myself"|"others",` +
    `"geburtsdatum":"TT.MM.JJJJ","sozialversicherung":"ÖGK"|"BVAEB"|"SVS"|"KFA"|"Sonstige",` +
    `"tarif":"start"|"optimal"|"optplus"|"premium",` +
    `"addons":{"fit":bool,"eltern":bool,"mental":bool,"akut":bool,"baby":bool,"vital":bool},` +
    `"geschlecht":"männlich"|"weiblich"|"divers","vorname","name","svnummer"(10 digits),` +
    `"email","telefon","groesse","gewicht","leistungssport":"ja"|"nein","schwangerschaft":"ja"|"nein",` +
    `"privatVersichert7":"ja"|"nein","antraegeAbgelehnt":"ja"|"nein","besondereAnnahme":"ja"|"nein",` +
    `"beratungsort":"Online Videoberatung"|"Persönlich an einem UNIQA-Standort"|"Per Telefon"}\n` +
    `Seed ${seed} — vary plausibly.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.85,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`  ⚠ OpenAI form fill ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return null;
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    return { source: MODEL, ...JSON.parse(text) };
  } catch (e) {
    console.warn(`  ⚠ GPT form fill failed: ${e.message}`);
    return null;
  }
}

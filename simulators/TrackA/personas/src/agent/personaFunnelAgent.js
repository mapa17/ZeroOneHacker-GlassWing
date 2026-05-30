// Page-by-page persona walk through the UNIQA online funnel.
//
// Two layers, by design (so it matches the REAL funnel instead of being an
// optimistic LLM that always finishes):
//
//   1. CHARACTER (LLM) — the model acts as this exact person, using the full
//      segment briefing (judith/franz/peter .md) + the sampled profile (.json).
//      It compares tariffs, deliberates in several beats, can mentally go back to
//      re-check, and grounds every reaction in what THIS person actually wants
//      from the product.
//
//   2. SEGMENT-CALIBRATED DROP-OFF (data) — how likely this persona is to keep
//      going past each step comes from that segment's real continue probability
//      (data/personas.js sim.continueProb, profile-adjusted via buildSimFromProfile).
//      These reproduce UNIQA's documented funnel (~66% leave at the first price
//      screen, ~24% at add-ons, ~78% at the final price → ~5.6% conversion).
//
// IMPORTANT: the calibrated drop-off does NOT silently override the persona. When
// the data says this person is the type to leave here, we tell the LLM up-front so
// it makes the decision IN CHARACTER and explains the real reason — the recorded
// action and the reasoning always agree (no "continue" on a dropped session).

import { readFileSync } from "node:fs";
import { decideJSON } from "../../scripts/gpt.mjs";
import { makeRng } from "../logic/personaProfileGenerator.js";
import { buildSimFromProfile } from "../logic/profileToSim.js";
import { resolvePersonaMd } from "./personaPromptBuilder.js";
import { synthesizeTelemetry } from "../logic/telemetrySynth.js";
import { analyzeMood } from "../logic/moodAnalysis.js";
import {
  FUNNEL_PAGES, RESULT_STEP, checkOutOfScope, calcPremium, TARIFFS,
  birthDateFromAge, personalDataFromProfile, DROP_REASON_CODES, screenContent,
} from "../logic/funnelPages.js";

const SYSTEM_INTRO =
  "You roleplay as ONE specific Austrian person using UNIQA's online private health insurance quote " +
  "calculator for the FIRST time. You are a real, busy, sometimes skeptical shopper — NOT a form-completion " +
  "bot. You think out loud, you sometimes go back to re-check something, and you judge everything against " +
  "what YOU personally want from this insurance and what it costs relative to YOUR budget.\n\n" +
  "CRITICAL — you are seeing this calculator for the FIRST time and you do NOT know what comes next. " +
  "React ONLY to what is on the screen in front of you right now. Do NOT anticipate future prices, tariff " +
  "details, advisory requirements, or steps you have not reached yet — you genuinely cannot see them. " +
  "Your reasons for hesitating or leaving must be grounded ONLY in what this current screen shows you.\n\n" +
  "Many real people like you do NOT finish: they hesitate, find it too complicated, aren't sure which " +
  "option applies to them, worry about cost once they see a price, want to compare elsewhere, or would " +
  "rather talk to a human. Stay 100% in character based on the briefing below. On each page reply ONLY " +
  "with the requested JSON.\n\n" +
  "HOW YOU WEIGH THIS DECISION (think like a real person, not a calculator):\n" +
  "- Affordability is RELATIVE: the same €/month feels cheap to a high earner and painful to someone on a " +
  "tight income. Always judge a price as a share of YOUR monthly income and on top of what you ALREADY pay " +
  "for insurance. €50 is trivial on €5.000 income but a real sacrifice on €1.200.\n" +
  "- Felt need: do you actually feel you need this NOW? Young/healthy people often feel they can wait; a " +
  "recent illness, a hospital stay, kids, or aging parents make it feel urgent and worth more.\n" +
  "- Value for money: is it clear what you GET for the price? Paying more only feels OK if the benefit is obvious.\n" +
  "- Overlap: if you already hold similar cover, paying again feels wasteful.\n" +
  "- Effort vs. inertia: finishing takes effort; if it gets complicated you may postpone even when willing.\n" +
  "- Trust & control: surprises, unclear value, or being pushed somewhere lower your trust.\n" +
  "- Channel comfort: some people simply prefer a human to handle it.\n" +
  "Weigh these factors against each other for THIS specific person, given THEIR income, age, household and " +
  "life situation — and let them tip the decision the way they realistically would.";

// Remove the section of the briefing that narrates the whole calculator journey
// (exact screens, the four tariffs, the advisory wall, the final-price commitment,
// the 66%/78% exit points). Feeding that each page would give the persona foreknowledge
// of screens they haven't reached yet. Personality, demographics, motivations and
// calibration notes are kept.
function stripJourneySpoilers(md) {
  return md.replace(
    /\n##\s+How you behave in the online insurance calculator[\s\S]*?(?=\n##\s|$)/i,
    "\n",
  );
}

export function buildSystem(profile) {
  let md = "";
  try {
    md = readFileSync(resolvePersonaMd(profile), "utf8");
  } catch {
    md = "";
  }
  return `${SYSTEM_INTRO}\n\n=== YOUR FULL CHARACTER BRIEFING (BE THIS PERSON) ===\n${stripJourneySpoilers(md)}`;
}

export function buildDossier(profile) {
  const d = profile.demographics || {};
  const ib = profile.insurance_behavior || {};
  const le = profile.life_events_and_plans || {};
  const experienced = le.experienced_last_5_years || le.experienced || [];
  const planned = le.planned_next_3_years || le.planned || [];
  const lines = [
    `=== YOUR SAMPLED ATTRIBUTES (stay 100% consistent with these — they ARE you) ===`,
    `Name: ${profile.persona_name} · Age: ${d.age} · Gender: ${d.gender}`,
    `${d.urbanity || ""} · household: ${d.household_type || "?"} · education: ${d.education}`,
    `Income: €${d.income_monthly_eur}/mo (${d.income_label}) — judge every price against THIS budget`,
    `Owns insurance: ${(ib.owned_products || []).join(", ") || "—"} · monthly insurance spend: €${ib.monthly_insurance_spend_eur}`,
    `Switch willingness: ${ib.switch_willingness}% · intends next 3y: ${(ib.intended_purchases_next_3y || []).join(", ") || "—"}`,
    `Online behaviour: ${(profile.online_behavior || []).join(", ") || "—"}`,
    `Top decision drivers (what sways you): ${(profile.top_decision_drivers || []).join(", ") || "—"}`,
    `Top purchase criteria (what you WANT from the product): ${(profile.top_purchase_criteria || []).join(", ") || "—"}`,
    `Channel preferences: ${JSON.stringify(profile.channel_preferences || {})}`,
  ];
  if (profile.preferred_information_channels)
    lines.push(`Where you go for info: ${(profile.preferred_information_channels || []).join(", ")}`);
  if (experienced.length || planned.length)
    lines.push(`Life events — recent: ${experienced.join(", ") || "—"}; planned: ${planned.join(", ") || "—"}`);
  if (d.financial_assets || profile.financial_assets)
    lines.push(`Financial situation: ${d.financial_assets || profile.financial_assets}`);
  if (profile.behavioral_summary) lines.push(`In a nutshell: ${profile.behavioral_summary}`);
  if (profile.typical_quote) lines.push(`Something you'd actually say: "${profile.typical_quote}"`);
  return lines.join("\n");
}

function pageSchema(step) {
  switch (step) {
    case 0: return `"choice": {"coverage": array of any of ["arzt","krankenhaus"]}`;
    case 1: return `"choice": {"insuredPerson": "myself" | "others"}`;
    case 2: return `"choice": {"sozialversicherung": "ÖGK"|"BVAEB"|"SVS"|"KFA"|"Sonstige"}`;
    case 3: return `"choice": {"tarif": "start"|"optimal"|"optplus"|"premium"}, "considered": [one object PER tariff you see {"tarif":"start|optimal|optplus|premium","gets":"the concrete benefits THIS tariff gives you, citing the actual covered amounts you see","missing":"what it does NOT cover (the '–' rows) that you might care about","relevanceToMe":"how relevant those benefits/gaps are for YOUR age, health and situation","take":"your one-line verdict on this tariff vs what you want"}]`;
    case 4: return `"choice": {"addons": array (possibly empty) of ["fit","eltern","mental","akut","baby","vital"]}`;
    case 5: return `"choice": {} (your personal data is auto-filled from your profile)`;
    case 6: return `"choice": {"privatVersichert7":"ja"|"nein","antraegeAbgelehnt":"ja"|"nein","besondereAnnahme":"ja"|"nein"} (answer HONESTLY for this person)`;
    default: return `"choice": {}`;
  }
}

// Concrete affordability framing so the persona reacts to a price the way someone on
// THEIR income realistically would (a price is only "high" relative to a budget).
export function priceShareOfIncome(price, profile) {
  const income = Number(profile?.demographics?.income_monthly_eur) || 0;
  if (!income || !price) return null;
  return Math.round((price / income) * 1000) / 10;
}

function affordabilityLine(price, profile) {
  const share = priceShareOfIncome(price, profile);
  if (share == null) return "";
  const income = Number(profile.demographics.income_monthly_eur);
  const spend = Number(profile?.insurance_behavior?.monthly_insurance_spend_eur) || 0;
  return ` For YOU that is ~${share}% of your €${income}/month income` +
    (spend ? `, on top of the €${spend}/month you already spend on insurance` : "") +
    `. Decide whether that is worth it given what THIS screen actually offers you and how much you feel you need it.`;
}

function priceBlock(page, state, profile) {
  if (page.step === 6 && state.finalPremium != null) {
    return `This is the last step before you would actually commit. The full monthly price you would sign up ` +
      `for is €${state.finalPremium.toFixed(2)}/month (tariff ${TARIFFS[state.tarif]?.name}) — the SAME price ` +
      `you saw at the tariff step; it does not change here. This screen is where it becomes real: you are about ` +
      `to lock this in.` +
      affordabilityLine(state.finalPremium, profile);
  }
  if (state.tarif) {
    const p = calcPremium(state.tarif, state.addons);
    return `Current price shown: €${p.toFixed(2)}/month (tariff ${TARIFFS[state.tarif]?.name}).` +
      affordabilityLine(p, profile);
  }
  return "No price shown yet.";
}

// Plausible reasons to stop, grounded ONLY in what THIS screen shows. No price or
// advisory talk before a price/tariff is actually visible (step 3+).
function leaveReasons(step) {
  if (step <= 1)
    return "this online tool doesn't feel like the right way for you, it's not clear which option even applies " +
      "to you, the whole thing already feels like it could get complicated, or you'd honestly rather just phone " +
      "someone and have them help";
  if (step === 2)
    return "entering your personal data makes you wonder whether you're already committing to something, it " +
      "feels like more hassle than you expected, or you'd rather have a real person handle it";
  if (step === 3)
    return "the monthly price feels high against your budget, the tariffs that look right for you are marked " +
      "'Nur nach Beratung', there are too many numbers and terms to compare with any confidence, or you'd want " +
      "to compare other providers first";
  if (step === 4)
    return "the price keeps creeping up as you look at add-ons, or you genuinely can't tell which extras you " +
      "actually need";
  if (step === 5)
    return "form fatigue — too many fields, it's dragging on, or you're uneasy about handing over this much " +
      "personal data";
  if (step === 6)
    return "seeing the FULL monthly price you'd actually commit to — right next to these health/contract " +
      "questions — makes it suddenly real; locking in that amount long-term feels like a lot, or you're just " +
      "not confident enough to finalise online right now and would rather double-check or sleep on it";
  return "something on this screen genuinely stops you";
}

function dispositionBlock(disposition, step) {
  if (disposition === "leave") {
    return [
      `\n=== YOUR STATE OF MIND RIGHT NOW ===`,
      `THIS screen is where you actually stop the online process — you are not going to click forward from here`,
      `right now. Still look at what's on screen and make your selection as you weigh it, then explain the REAL`,
      `reason you stop, grounded ONLY in what THIS screen shows you. For where you are now, that's likely:`,
      `${leaveReasons(step)}.`,
      `Set "action" to "abandon". Be specific and honest about what on THIS screen stopped you — not a generic`,
      `"I'll think about it", and do NOT reference prices or later screens you haven't actually seen yet.`,
    ].join("\n");
  }
  return [
    `\n=== YOUR STATE OF MIND RIGHT NOW ===`,
    `You are inclined to keep going past this screen — it does enough of what you want for now. Make your`,
    `selection and set "action" to "continue". Only set "abandon" if something on THIS screen genuinely and`,
    `specifically stops you (then say exactly what — grounded only in what you can see right now).`,
  ].join("\n");
}

export function buildUserPrompt(page, dossier, state, disposition, profile) {
  const optionLines = page.options.map((o) => `  - ${o.key}: ${o.label}`).join("\n");
  const wantDeepThinking = page.step === 3 || page.step === 6 || page.step === 4;
  const reactToOptions = page.step === 0 || page.step === 1 || page.step === 4;
  const content = screenContent(page.step);
  const codeList = Object.entries(DROP_REASON_CODES)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
  return [
    dossier,
    `\n=== FUNNEL PROGRESS ===`,
    `You are on step ${page.step} of 7 — "${page.name}".`,
    priceBlock(page, state, profile),
    `\nThis page asks: ${page.asks}`,
    content
      ? `\nWhat you actually SEE on this screen (react to these specific things, by name):\n${content}`
      : (page.options.length ? `Options:\n${optionLines}` : ""),
    dispositionBlock(disposition, page.step),
    `\nReply with JSON only:`,
    `{ ${pageSchema(page.step)},`,
    reactToOptions
      ? `  "optionReactions": [one object PER option you see {"option":"the option name exactly as shown","take":"what you specifically think about THIS option and whether it fits your situation"}], "whyThisOne": "why you pick the one you pick over the other(s) — or why none of them work for you",`
      : "",
    `  "wants": "what you are hoping to get here, tied to your purchase criteria (short, first person, German)",`,
    `  "deliberation": [${wantDeepThinking
        ? `"3-5 short first-person beats showing your REAL thinking on this screen: go through the specific options/tariffs by name, say what each gets you and what it lacks for YOUR situation, weigh the price against YOUR income/budget (what share of your monthly income it is and whether it's worth it), and include going back to re-check something ("Ich schau nochmal zurück, was bei Start dabei ist…")"`
        : `"1-3 short first-person beats of what goes through your mind as you read THIS screen"`}],`,
    `  "thoughts": "1-2 sentence summary, first person, German",`,
    `  "concern": "your single biggest hesitation here right now (short, German)",`,
    `  "dropReasonCode": "REQUIRED only if action is \\"abandon\\": the SINGLE closest of [${codeList}]. Pick the one that truly drives your decision for THIS person.",`,
    `  "action": "continue" | "abandon" }`,
  ].filter(Boolean).join("\n");
}

export function applyChoice(step, choice = {}, sel, profile, rng) {
  switch (step) {
    case 0: {
      const cov = Array.isArray(choice.coverage) ? choice.coverage : [];
      sel.coverage = { arzt: cov.includes("arzt"), krankenhaus: cov.includes("krankenhaus") };
      if (!sel.coverage.arzt && !sel.coverage.krankenhaus) sel.coverage.arzt = true;
      break;
    }
    case 1:
      sel.insuredPerson = choice.insuredPerson === "others" ? "others" : "myself";
      break;
    case 2:
      sel.geburtsdatum = birthDateFromAge(profile.demographics?.age ?? 40, rng);
      sel.sozialversicherung = choice.sozialversicherung || "ÖGK";
      break;
    case 3:
      sel.tarif = ["start", "optimal", "optplus", "premium"].includes(choice.tarif) ? choice.tarif : "optimal";
      break;
    case 4: {
      const keys = ["fit", "eltern", "mental", "akut", "baby", "vital"];
      const chosen = Array.isArray(choice.addons) ? choice.addons : [];
      sel.addons = Object.fromEntries(keys.map((k) => [k, chosen.includes(k)]));
      break;
    }
    case 5: {
      Object.assign(sel, personalDataFromProfile(profile, rng));
      const plans = profile.life_events_and_plans?.planned_next_3_years || [];
      sel.leistungssport = plans.includes("more_sports") && rng() < 0.3 ? "ja" : "nein";
      sel.schwangerschaft =
        profile.demographics?.gender === "female" && (profile.demographics?.age ?? 99) < 45 && rng() < 0.08 ? "ja" : "nein";
      break;
    }
    case 6:
      sel.privatVersichert7 = choice.privatVersichert7 === "ja" ? "ja" : "nein";
      sel.antraegeAbgelehnt = choice.antraegeAbgelehnt === "ja" ? "ja" : "nein";
      sel.besondereAnnahme = choice.besondereAnnahme === "ja" ? "ja" : "nein";
      break;
    default:
      break;
  }
}

export async function runPersonaThroughFunnel(profile, archetype, opts = {}) {
  const { model, seed = 1 } = opts;
  const piiRng = makeRng(seed);
  const gateRng = makeRng((seed + 1000003) >>> 0); // independent stream for drop-off disposition
  const system = buildSystem(profile);
  const dossier = buildDossier(profile);

  const baseSim = archetype?.sim || { continueProb: { 0: 0.95, 1: 0.95, 2: 0.95, 3: 0.35, 4: 0.78, 5: 0.92, 6: 0.28 } };
  let continueProb = baseSim.continueProb;
  try {
    continueProb = buildSimFromProfile(baseSim, profile).sim.continueProb;
  } catch {
    /* fall back to base */
  }

  const sel = {};
  const state = { tarif: null, addons: {}, estimatedPremium: null, finalPremium: null };
  const walk = [];
  let status = "completed_online";
  let stoppedAt = null;

  for (const page of FUNNEL_PAGES) {
    // Keep the running price in sync for the prompt.
    if (sel.tarif) {
      state.tarif = sel.tarif;
      state.addons = sel.addons || {};
      state.estimatedPremium = calcPremium(state.tarif, state.addons);
    }
    // The online price is fixed once tariff + add-ons are chosen — this matches the
    // REAL UNIQA funnel (calcPremium depends only on tariff + add-ons; the step-6
    // health questions never raise it). Step 6 is simply the first time the FULL
    // monthly price is shown together with the commitment, so the final price EQUALS
    // the estimate — there is no surprise increase.
    if (page.step === 6 && state.estimatedPremium != null && state.finalPremium == null) {
      state.finalPremium = state.estimatedPremium;
    }

    // Decide disposition from the segment-calibrated drop-off BEFORE the call, so
    // the persona narrates a coherent decision (no "continue" on a dropped step).
    const cont = continueProb?.[page.step] ?? 0.95;
    const disposition = gateRng() >= cont ? "leave" : "proceed";

    let decision;
    const callStart = Date.now();
    try {
      decision = await decideJSON({ system, user: buildUserPrompt(page, dossier, state, disposition, profile), model, temperature: 0.9 });
    } catch (e) {
      walk.push({ step: page.step, page: page.name, error: e.message, action: "abandon", thoughts: "(LLM error)", concern: "technischer Fehler" });
      status = "dropped";
      stoppedAt = { step: page.step, page: page.name, reason: "llm_error", detail: e.message };
      return finalize(profile, archetype, sel, state, walk, status, stoppedAt, seed, model);
    }

    applyChoice(page.step, decision.choice || {}, sel, profile, piiRng);
    if (sel.tarif) state.tarif = sel.tarif;
    if (sel.addons) state.addons = sel.addons;

    const llmAbandon = decision.action === "abandon";
    // REAL measured thinking time + deliberation volume for THIS screen.
    const usage = decision._usage || {};
    const thinkingMs = Number(decision._latencyMs) || (Date.now() - callStart);
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? null;
    const entry = {
      step: page.step,
      page: page.name,
      choice: decision.choice || {},
      wants: String(decision.wants || "").trim(),
      deliberation: Array.isArray(decision.deliberation) ? decision.deliberation.map((b) => String(b).trim()).filter(Boolean) : [],
      thoughts: String(decision.thoughts || "").trim(),
      concern: String(decision.concern || "").trim(),
      thinkingMs,
      tokens: {
        prompt: usage.prompt_tokens ?? null,
        completion: usage.completion_tokens ?? null,
        reasoning: reasoningTokens,
        total: usage.total_tokens ?? null,
      },
    };
    if (Array.isArray(decision.considered)) entry.considered = decision.considered;
    if (Array.isArray(decision.optionReactions)) entry.optionReactions = decision.optionReactions;
    if (decision.whyThisOne) entry.whyThisOne = String(decision.whyThisOne).trim();

    // Categorised abandon reason (validated against the taxonomy) + the price as a
    // share of THIS person's income at the moment they are looking at it. These power
    // the segmented, quantified drop-off insight in the report.
    const reasonCode = DROP_REASON_CODES[decision.dropReasonCode] ? decision.dropReasonCode : null;
    const shownPrice = page.step === 6 && state.finalPremium != null
      ? state.finalPremium
      : (state.tarif ? calcPremium(state.tarif, state.addons) : null);
    const shareOfIncome = priceShareOfIncome(shownPrice, profile);
    if (reasonCode) entry.dropReasonCode = reasonCode;
    if (shareOfIncome != null) entry.priceShareOfIncomePct = shareOfIncome;

    // 1) Out-of-scope (their own selection) takes precedence.
    const oos = checkOutOfScope(sel);
    if (oos) {
      entry.action = "out_of_scope";
      walk.push(entry);
      status = "out_of_scope";
      stoppedAt = {
        step: oos.step,
        page: (FUNNEL_PAGES.find((p) => p.step === oos.step) || page).name,
        reason: oos.reason,
        detail: oos.label,
      };
      return finalize(profile, archetype, sel, state, walk, status, stoppedAt, seed, model);
    }

    // 2) In-scope drop-off: either the segment disposition said leave, or the
    //    persona independently decided to abandon. Either way action == abandon.
    if (disposition === "leave" || llmAbandon) {
      entry.action = "abandon";
      walk.push(entry);
      status = "dropped";
      stoppedAt = {
        step: page.step,
        page: page.name,
        reason: disposition === "leave" ? "segment_dropoff" : "abandoned",
        reasonCode: reasonCode || "other",
        priceShareOfIncomePct: shareOfIncome,
        detail: entry.concern || entry.thoughts || "(no reason given)",
      };
      return finalize(profile, archetype, sel, state, walk, status, stoppedAt, seed, model);
    }

    entry.action = "continue";
    walk.push(entry);
  }

  return finalize(profile, archetype, sel, state, walk, status, stoppedAt, seed, model);
}

function finalize(profile, archetype, sel, state, walk, status, stoppedAt, seed, model) {
  const tarif = sel.tarif || null;
  const estimated = tarif ? calcPremium(tarif, sel.addons || {}) : null;
  const premium = status === "completed_online" && state.finalPremium != null ? state.finalPremium : estimated;
  const outcome = {
    tarif,
    tarifName: tarif ? TARIFFS[tarif]?.name : null,
    estimatedPremium: estimated,
    finalPremium: state.finalPremium,
    premiumPerMonth: premium,
    reachedStep: status === "completed_online" ? RESULT_STEP : (stoppedAt?.step ?? null),
    route: status === "completed_online" ? "online_purchase" : status === "out_of_scope" ? "consultation" : "abandoned",
  };
  const telemetry = synthesizeTelemetry({ profile, selections: sel, walk, status, stoppedAt, outcome, seed });
  const result = {
    persona: {
      name: profile.persona_name,
      gender: profile.demographics?.gender,
      age: profile.demographics?.age,
      segmentId: profile.persona_id,
      segment: profile.segment_name,
      archetype: archetype?.name || profile.archetype_name,
    },
    seed,
    model: model || null,
    status,
    stoppedAt,
    completedOnline: status === "completed_online",
    outOfScope: status === "out_of_scope",
    outcome,
    telemetry,
    selections: sel,
    walk,
    profile,
  };
  result.mood = analyzeMood(result);
  return result;
}

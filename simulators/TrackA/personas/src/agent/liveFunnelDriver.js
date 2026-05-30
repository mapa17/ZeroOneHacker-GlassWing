// LIVE persona driver — runs ONE persona through the REAL hosted UNIQA UI in a
// real browser (Playwright). Unlike the in-memory funnel sim, here:
//
//   • The LLM decides each step in character (same prompts as the offline runner).
//   • Every action is a REAL DOM interaction (clicks, char-by-char typing, mouse
//     movement) on the actual React form — so the app's own useTracking records
//     genuine telemetry.
//   • TIME IS REAL WALL-CLOCK: the UI measures dwell as Date.now() deltas between
//     page changes. We make the browser linger for a human-realistic reading time
//     (persona-estimated dwellSeconds + real typing + real LLM latency), and the UI
//     measures whatever actually elapses. Nothing about time is written by us.
//
// At the end we read the UI's own telemetry snapshot straight out of the running
// app (the "Daten" panel's live JSON), so the saved file IS the real UI's data.

import { decideJSON } from "../../scripts/gpt.mjs";
import { msToReadable } from "../logs/constants.js";
import { makeRng } from "../logic/personaProfileGenerator.js";
import { buildSimFromProfile } from "../logic/profileToSim.js";
import {
  FUNNEL_PAGES, calcPremium, TARIFFS, OFFLINE_TARIFFS, DROP_REASON_CODES,
} from "../logic/funnelPages.js";
import {
  buildSystem, buildDossier, buildUserPrompt, applyChoice, priceShareOfIncome,
} from "./personaFunnelAgent.js";
import { analyzeMood } from "../logic/moodAnalysis.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.round(ms))));

// Per-step sane bounds (seconds) for how long a human lingers — clamps the
// persona's own dwell estimate so it stays realistic in both directions.
const DWELL_CLAMP = {
  0: [5, 30], 1: [3, 16], 2: [6, 35], 3: [15, 110], 4: [8, 55], 5: [25, 150], 6: [8, 48], 7: [5, 25],
};

const HEADINGS = {
  0: /Wo möchten Sie abgesichert/i,
  1: /Wer soll versichert/i,
  2: /individuelle Prämie/i,
  3: /Welche Leistungen soll/i,
  4: /Extra-Schutz/i,
  5: /Angaben zu Ihrer Person/i,
  6: /Bisherige Versicherungen/i,
  7: /Wo soll die Beratung/i,
  8: /(Online abschließbar|Beratung erforderlich|Beratungsanfrage)/i,
};

// Reading pace multiplier for THIS person (lower = faster reader/decider).
function tempoFor(profile) {
  const d = profile.demographics || {};
  const age = Number(d.age) || 40;
  const comfort = Number((profile.online_comfort ?? profile.onlineComfort)) || 3;
  let m = 1;
  if (age >= 60) m *= 1.35; else if (age >= 45) m *= 1.12; else if (age < 30) m *= 0.9;
  const onlineHi = (profile.online_behavior || []).some((s) => /compar|research|online|digital/i.test(String(s)));
  if (onlineHi) m *= 0.9;
  if (comfort >= 4) m *= 0.85; else if (comfort <= 2) m *= 1.2;
  return Math.max(0.6, Math.min(1.8, m));
}

// Human typing time (ms) a real person would need for the fields on this step —
// used to reconstruct human-equivalent time independent of how fast we actually ran.
const HUMAN_MS_PER_CHAR = 100;
function humanTypingMs(step, sel) {
  let chars = 0;
  if (step === 2) chars = String(sel.geburtsdatum || "").length;
  if (step === 5) chars = ["vorname", "name", "svnummer", "email", "telefon", "groesse", "gewicht"]
    .reduce((s, k) => s + String(sel[k] || "").length, 0);
  return chars * HUMAN_MS_PER_CHAR;
}

async function wander(page, rng, moves, pace) {
  for (let i = 0; i < moves; i++) {
    await page.mouse.move(180 + Math.floor(rng() * 640), 200 + Math.floor(rng() * 380), { steps: 6 });
    await sleep((90 + rng() * 220) * pace);
  }
}

async function humanType(page, locator, text, rng, pace) {
  const v = String(text ?? "");
  await locator.click();
  await sleep((120 + rng() * 200) * pace);
  await locator.fill("");
  for (const ch of v) {
    await page.keyboard.type(ch);
    await sleep((55 + rng() * 120) * pace);
  }
}

async function hoverFor(locator, ms) {
  try { await locator.hover({ timeout: 2500 }); } catch { /* element may be off-screen */ }
  await sleep(ms);
}

async function clickCTA(page, pace) {
  for (const label of ["Weiter", "Zur Beratungsanfrage", "Anfrage senden"]) {
    const b = page.getByRole("button", { name: label, exact: true });
    if ((await b.count()) && (await b.first().isEnabled().catch(() => false))) {
      await b.first().hover().catch(() => {});
      await sleep(180 * pace);
      await b.first().click();
      return label;
    }
  }
  throw new Error("No enabled CTA button found");
}

// ---- per-step real DOM actions ---------------------------------------------
async function actStep(page, step, sel, rng, pace, log) {
  if (step === 0) {
    await hoverFor(page.locator("button", { hasText: "Bei Arztbesuchen" }).first(), (700 + rng() * 600) * pace);
    await hoverFor(page.locator("button", { hasText: "Im Krankenhaus" }).first(), (600 + rng() * 600) * pace);
    if (sel.coverage?.arzt) await page.locator("button", { hasText: "Bei Arztbesuchen" }).first().click();
    if (sel.coverage?.krankenhaus) await page.locator("button", { hasText: "Im Krankenhaus" }).first().click();
  } else if (step === 1) {
    const label = sel.insuredPerson === "others" ? "Andere Personen" : "Ich selbst";
    await page.getByRole("button", { name: label }).first().click();
  } else if (step === 2) {
    await humanType(page, page.getByPlaceholder("TT.MM.JJJJ"), sel.geburtsdatum, rng, pace);
    await page.locator("select").first().selectOption({ label: sel.sozialversicherung || "ÖGK" });
  } else if (step === 3) {
    const order = ["start", "optimal", "optplus", "premium"];
    const cards = page.getByRole("button", { name: /Wählen|Ausgewählt/ });
    // browse a couple of tariff cards (real hovers → real hover telemetry)
    for (const k of [order.indexOf(sel.tarif), 1].filter((i) => i >= 0)) {
      await hoverFor(cards.nth(k), (900 + rng() * 1200) * pace);
    }
    const idx = Math.max(0, order.indexOf(sel.tarif));
    await cards.nth(idx).click();
  } else if (step === 4) {
    const order = ["fit", "eltern", "mental", "akut", "baby", "vital"];
    const toggles = page.locator("xpath=//button[not(normalize-space(.))]");
    for (let i = 0; i < order.length; i++) {
      if (sel.addons?.[order[i]]) { await toggles.nth(i).click().catch(() => {}); await sleep((300 + rng() * 300) * pace); }
    }
  } else if (step === 5) {
    const g = sel.geschlecht || "männlich";
    await page.getByRole("button", { name: g, exact: true }).first().click().catch(() => {});
    const inputs = page.locator("input");
    const vals = [sel.vorname, sel.name, sel.svnummer, sel.email, sel.telefon, sel.groesse, sel.gewicht];
    for (let i = 0; i < vals.length; i++) await humanType(page, inputs.nth(i), vals[i], rng, pace);
    const sport = sel.leistungssport === "ja" ? 0 : 1;     // ja / nein within group 0
    const preg = sel.schwangerschaft === "ja" ? 0 : 1;     // group 1
    await page.getByRole("button", { name: sport === 0 ? "ja" : "nein", exact: true }).nth(0).click().catch(() => {});
    await page.getByRole("button", { name: preg === 0 ? "ja" : "nein", exact: true }).nth(preg === 0 ? 1 : 1).click().catch(() => {});
  } else if (step === 6) {
    const answers = [sel.privatVersichert7, sel.antraegeAbgelehnt, sel.besondereAnnahme].map((a) => (a === "ja" ? "ja" : "nein"));
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: answers[i], exact: true }).nth(i).click().catch(() => {});
      await sleep((250 + rng() * 250) * pace);
    }
  } else if (step === 7) {
    await page.getByRole("button", { name: sel.beratungsort || "Online Videoberatung" }).first().click().catch(() => {});
  }
}

function expectedNext(step, sel) {
  const offline = sel.tarif && OFFLINE_TARIFFS.includes(sel.tarif);
  const healthYes = sel.privatVersichert7 === "ja" || sel.antraegeAbgelehnt === "ja" || sel.besondereAnnahme === "ja";
  if (step === 0) return sel.coverage?.krankenhaus ? 8 : 1;
  if (step === 1) return sel.insuredPerson === "others" ? 8 : 2;
  if (step < 6) return step + 1;
  if (step === 6) return offline || healthYes ? 7 : 8;
  if (step === 7) return 8;
  return 8;
}

async function readTelemetry(page) {
  // Switch to the "Daten" panel and read the app's own live telemetry JSON.
  await page.getByRole("button", { name: "Daten", exact: true }).click().catch(() => {});
  await sleep(400);
  const txt = await page.locator("pre").first().innerText();
  return JSON.parse(txt);
}

/** Persona reads the on-screen chat coach and may reply in character. */
async function maybeChatWithCoach(page, profile, decision, step, model, pace, rng) {
  try {
    const open = await page.locator('[data-coach-chat="open"]').count();
    if (!open) {
      await page.locator('[data-coach-toggle="open"]').first().click({ timeout: 2000 }).catch(() => {});
      await sleep(350 * pace);
    }
    await sleep(Math.max(800, 1400 * pace));

    const coachMsgs = await page.locator('[data-coach-message="coach"]').allInnerTexts();
    const lastCoach = (coachMsgs[coachMsgs.length - 1] || "").trim();
    if (!lastCoach || lastCoach.length < 8) return null;

    const prompt =
      `Der UNIQA-Chat-Helfer schreibt:\n"${lastCoach.slice(0, 600)}"\n\n` +
      `Du bist ${profile.persona_name} auf Schritt ${step}. Deine Gedanken gerade: ${decision.thoughts || decision.concern || decision.wants || ""}\n` +
      `Antworte NUR als JSON: {"reply": "kurze Antwort auf Deutsch" oder null wenn du ignorierst, "useQuickReply": "exakter Quick-Reply-Text" oder null}`;

    let chatDec;
    try {
      chatDec = await decideJSON({ system: `Du bist ${profile.persona_name}. Bleib in Charakter — kurz, natürlich.`, user: prompt, model, temperature: 0.88 });
    } catch {
      return null;
    }

    const text = (chatDec.useQuickReply || chatDec.reply || "").trim();
    if (!text) return null;

    const quick = page.locator(`[data-coach-quick="${text}"]`);
    if (await quick.count()) {
      await quick.first().click();
      await sleep(400 * pace);
      return { replied: text, via: "quick" };
    }

    const input = page.locator("[data-coach-input]");
    if (await input.count()) {
      await humanType(page, input.first(), text.slice(0, 180), rng, pace * 0.75);
      await page.locator("[data-coach-send]").click();
      await sleep(900 * pace);
      return { replied: text, via: "typed" };
    }
  } catch {
    /* chat optional */
  }
  return null;
}

// Read every coach bubble currently on screen (latest last).
async function readCoachBubbles(page) {
  try { return await page.locator('[data-coach-message="coach"]').allInnerTexts(); }
  catch { return []; }
}

// Persona writes a concern into the on-screen coach, waits for the real LLM reply,
// then RE-DECIDES whether the advice changes its action / choice. This is the core
// of the coach experiment: a chance to rescue a drop or steer to an online tariff.
async function askCoachAndReconsider({
  page, profile, system, step, page_, sel, state, disposition, decision, model, pace, rng, question = null,
}) {
  const result = { interacted: false, coachText: null, question: null, changed: false, action: null, choicePatch: null, changeReason: null };
  try {
    if (!(await page.locator('[data-coach-chat="open"]').count())) {
      await page.locator('[data-coach-toggle="open"]').first().click({ timeout: 2000 }).catch(() => {});
      await sleep(300 * pace);
    }
    const before = await readCoachBubbles(page);

    // 1) Persona writes to the coach — its own question if it had one, else its concern.
    const concern = (question && question.trim())
      ? question.trim().slice(0, 180)
      : String(decision.concern || decision.thoughts || decision.wants || "Ich bin unsicher, ob das hier für mich passt.").slice(0, 180);
    const input = page.locator("[data-coach-input]");
    if (!(await input.count())) return result;
    await humanType(page, input.first(), concern, rng, pace * 0.7);
    await page.locator("[data-coach-send]").click().catch(() => {});
    result.interacted = true;
    result.question = concern;

    // 2) Wait for a new coach bubble (real LLM, not compressed) — bounded.
    let coachText = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const now = await readCoachBubbles(page);
      if (now.length > before.length) { coachText = now[now.length - 1]; break; }
    }
    if (!coachText) {
      const now = await readCoachBubbles(page);
      coachText = now[now.length - 1] || null;
    }
    result.coachText = coachText ? coachText.slice(0, 800) : null;
    if (!result.coachText) return result;

    // 3) Reconsider in character. The helper can't change facts, but can resolve
    //    a misunderstanding (e.g. "Plus is advisory, Start/Optimal are online").
    const offlineNow = sel.tarif && OFFLINE_TARIFFS.includes(sel.tarif);
    const leverHint = step === 0
      ? `Du kannst die Absicherung ändern (coverage: ["arzt"] für Privatarzt online, ["krankenhaus"] ist ein anderes Produkt).`
      : step === 1
        ? `Du kannst die versicherte Person ändern (insuredPerson: "myself" oder "others").`
        : step === 3
          ? `Du kannst den Tarif ändern (tarif: "start"/"optimal" sind online, "optplus"/"premium" nur mit Beratung). Aktuell: ${sel.tarif || "—"}.`
          : `Du kannst nur deine Handlung ändern (weitermachen oder abbrechen) — Fakten über dich bleiben gleich.`;

    const reconsiderPrompt = [
      `Du bist weiterhin ${profile.persona_name}, auf Schritt ${step} ("${page_.name}").`,
      `Du wolltest gerade: ${decision.action === "abandon" || disposition === "leave" ? "ABBRECHEN" : "weitermachen"}` +
        `${offlineNow ? " mit einem Tarif, der nur nach Beratung geht" : ""}.`,
      `Dein Grund/Gefühl: "${concern}"`,
      ``,
      `Der UNIQA-Helfer hat dir geantwortet:`,
      `"${result.coachText}"`,
      ``,
      `Entscheide EHRLICH in deinem Charakter neu. Guter Rat darf dein Anliegen auflösen, aber überrede dich nicht gegen deine echten Bedürfnisse/Budget. ${leverHint}`,
      `Antworte NUR als JSON:`,
      `{"action":"continue"|"abandon","changed":true|false,"changeReason":"ein kurzer Satz (Deutsch, erste Person)"` +
        `${step === 0 ? `,"coverage":["arzt"]|["krankenhaus"]|["arzt","krankenhaus"]` : ""}` +
        `${step === 1 ? `,"insuredPerson":"myself"|"others"` : ""}` +
        `${step === 3 ? `,"tarif":"start"|"optimal"|"optplus"|"premium"` : ""}}`,
    ].join("\n");

    let rec;
    try {
      rec = await decideJSON({ system, user: reconsiderPrompt, model, temperature: 0.7 });
    } catch {
      return result;
    }

    result.action = rec.action === "abandon" ? "abandon" : rec.action === "continue" ? "continue" : null;
    result.changed = !!rec.changed;
    result.changeReason = String(rec.changeReason || "").trim() || null;

    const patch = {};
    if (step === 0 && Array.isArray(rec.coverage)) patch.coverage = rec.coverage;
    if (step === 1 && (rec.insuredPerson === "myself" || rec.insuredPerson === "others")) patch.insuredPerson = rec.insuredPerson;
    if (step === 3 && ["start", "optimal", "optplus", "premium"].includes(rec.tarif)) patch.tarif = rec.tarif;
    if (Object.keys(patch).length) result.choicePatch = patch;

    // Small human-equivalent reading cost for the coach exchange.
    await sleep(400 * pace);
  } catch {
    /* coach optional — never break the run */
  }
  return result;
}

export async function runPersonaLive({ browser, url, profile, archetype, model, seed = 1, speed = 1, speedup = 1, coachAssist = false, log = () => {} }) {
  const piiRng = makeRng(seed);
  const gateRng = makeRng((seed + 1000003) >>> 0);
  const tempo = tempoFor(profile);
  // pace shrinks the human reading/typing pauses; `speedup` (e.g. 12) runs 12x
  // faster, `speed` (legacy multiplier) still supported. Interactions stay real.
  const pace = (speed || 1) / (speedup || 1);
  let humanEquivalentTotalMs = 0;
  const system = buildSystem(profile);
  const dossier = buildDossier(profile);

  const baseSim = archetype?.sim || { continueProb: { 0: 0.95, 1: 0.95, 2: 0.95, 3: 0.35, 4: 0.78, 5: 0.92, 6: 0.28 } };
  let continueProb = baseSim.continueProb;
  try { continueProb = buildSimFromProfile(baseSim, profile).sim.continueProb; } catch { /* base */ }

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("h2", { hasText: HEADINGS[0] }).first().waitFor({ timeout: 15000 });

  const sel = {};
  const state = { tarif: null, addons: {}, estimatedPremium: null, finalPremium: null };
  const walk = [];
  let status = "completed_online";
  let stoppedAt = null;
  let step = 0;
  let chatOpened = false;

  try {
    while (step <= 6) {
      if (sel.tarif) {
        state.tarif = sel.tarif;
        state.addons = sel.addons || {};
        state.estimatedPremium = calcPremium(state.tarif, state.addons);
      }
      if (step === 6 && state.estimatedPremium != null && state.finalPremium == null) state.finalPremium = state.estimatedPremium;

      const page_ = FUNNEL_PAGES.find((p) => p.step === step);
      const cont = continueProb?.[step] ?? 0.95;
      const disposition = gateRng() >= cont ? "leave" : "proceed";

      const tStart = Date.now();
      await wander(page, piiRng, 2, pace);

      // ── COACH ASSIST: the persona LOOKS IN THE CHAT FIRST and factors the
      //    on-screen coach hint into its decision (and may ask a question). ──
      let coachContext = "";
      if (coachAssist) {
        if (!chatOpened) {
          if (!(await page.locator('[data-coach-chat="open"]').count())) {
            await page.locator('[data-coach-toggle="open"]').first().click({ timeout: 1500 }).catch(() => {});
          }
          chatOpened = true;
        }
        await sleep(Math.max(250, 500 * pace)); // let the per-step hint render
        const bubbles = await readCoachBubbles(page);
        const lastCoach = (bubbles[bubbles.length - 1] || "").trim();
        if (lastCoach) {
          coachContext =
            `\n\n=== AUF DEM BILDSCHIRM: CHAT-HELFER (lies das ZUERST, bevor du entscheidest) ===\n` +
            `Der UNIQA-Helfer zeigt gerade:\n"${lastCoach.slice(0, 500)}"\n` +
            `Beziehe diesen Hinweis in deine Entscheidung ein. Wenn du dir unsicher bist oder eine konkrete ` +
            `Frage an den Helfer hast, gib ZUSÄTZLICH das Feld "askCoach": "deine kurze Frage auf Deutsch" ` +
            `zurück (sonst weglassen). Frage nur, wenn es dir wirklich hilft.`;
        }
      }

      const prompt = buildUserPrompt(page_, dossier, state, disposition, profile) +
        `\n\nAlso include an integer field "dwellSeconds": how many seconds YOU (this exact person, at your ` +
        `reading pace and care level) would realistically spend reading and thinking about THIS screen before ` +
        `acting. A rushed/confident person is quick; a careful/overwhelmed/older person lingers longer.` +
        coachContext;

      let decision;
      try {
        decision = await decideJSON({ system, user: prompt, model, temperature: 0.9 });
      } catch (e) {
        status = "dropped";
        stoppedAt = { step, page: page_.name, reason: "llm_error", detail: e.message };
        walk.push({ step, page: page_.name, error: e.message, action: "abandon" });
        break;
      }

      applyChoice(step, decision.choice || {}, sel, profile, piiRng);
      if (step === 7) sel.beratungsort = sel.beratungsort || "Online Videoberatung";
      if (sel.tarif) { state.tarif = sel.tarif; state.addons = sel.addons || {}; }

      const llmAbandon = decision.action === "abandon";
      const reasonCode = DROP_REASON_CODES[decision.dropReasonCode] ? decision.dropReasonCode : null;
      const shownPrice = step === 6 && state.finalPremium != null ? state.finalPremium : (state.tarif ? calcPremium(state.tarif, state.addons) : null);
      const entry = {
        step,
        page: page_.name,
        choice: decision.choice || {},
        wants: String(decision.wants || "").trim(),
        deliberation: Array.isArray(decision.deliberation) ? decision.deliberation.map((b) => String(b).trim()).filter(Boolean) : [],
        thoughts: String(decision.thoughts || "").trim(),
        concern: String(decision.concern || "").trim(),
        dwellSecondsEstimated: Number(decision.dwellSeconds) || null,
        llmLatencyMs: Number(decision._latencyMs) || null,
      };
      if (Array.isArray(decision.considered)) entry.considered = decision.considered;
      if (Array.isArray(decision.optionReactions)) entry.optionReactions = decision.optionReactions;
      if (decision.whyThisOne) entry.whyThisOne = String(decision.whyThisOne).trim();
      if (reasonCode) entry.dropReasonCode = reasonCode;
      if (shownPrice != null) entry.priceShareOfIncomePct = priceShareOfIncome(shownPrice, profile);

      // ── COACH ASSIST: let the persona consult the coach and possibly reconsider
      //    BEFORE acting, so the DOM reflects the final (post-advice) choice. ──
      let effDisposition = disposition;
      let effAbandon = llmAbandon;
      if (coachAssist) {
        const offline = sel.tarif && OFFLINE_TARIFFS.includes(sel.tarif);
        const krankenhaus = step === 0 && sel.coverage?.krankenhaus;
        const others = step === 1 && sel.insuredPerson === "others";
        const healthYes = step === 6 && (sel.privatVersichert7 === "ja" || sel.antraegeAbgelehnt === "ja" || sel.besondereAnnahme === "ja");
        const wouldLeave = disposition === "leave" || llmAbandon;
        const askText = typeof decision.askCoach === "string" && decision.askCoach.trim() ? decision.askCoach.trim() : null;
        // Consult the coach if the persona asked something OR is about to drop / on a losing choice.
        const warranted = !!askText || wouldLeave || offline || krankenhaus || others || healthYes;

        if (warranted) {
          const rc = await askCoachAndReconsider({
            page, profile, system, step, page_, sel, state, disposition, decision, model, pace, rng: piiRng,
            question: askText,
          });
          if (rc.interacted) {
            entry.coach = {
              trigger: askText ? "persona_asked" : "about_to_drop",
              question: rc.question,
              askedProactively: !!askText && !wouldLeave,
              coachReply: rc.coachText,
              reconsideredAction: rc.action,
              changed: rc.changed,
              changeReason: rc.changeReason,
              choicePatch: rc.choicePatch || null,
              originalAction: wouldLeave ? "abandon" : "continue",
            };
            humanEquivalentTotalMs += Math.round(9000 * tempo); // reading + chatting

            if (rc.choicePatch) {
              applyChoice(step, rc.choicePatch, sel, profile, piiRng);
              if (sel.tarif) { state.tarif = sel.tarif; state.addons = sel.addons || {}; }
            }
            if (rc.action === "continue") { effDisposition = "proceed"; effAbandon = false; }
            else if (rc.action === "abandon") { effAbandon = true; }
          }
        }
      }

      // Perform the REAL DOM interactions for this step (reflects final choice).
      await actStep(page, step, sel, piiRng, pace, log);

      // intended HUMAN reading/deliberation time (the persona's own estimate, at 1x).
      const [lo, hi] = DWELL_CLAMP[step] || [5, 40];
      const intendedDwellMs = Math.min(hi, Math.max(lo, Number(decision.dwellSeconds) || lo)) * tempo * 1000;
      const humanEquivMs = Math.round(intendedDwellMs + humanTypingMs(step, sel));
      humanEquivalentTotalMs += humanEquivMs;
      // Actually run the page at the compressed pace.
      const want = intendedDwellMs * pace;
      while (Date.now() - tStart < want) {
        await wander(page, piiRng, 1, pace);
        await sleep(Math.min(1200, want - (Date.now() - tStart)));
      }
      entry.realCompressedMs = Date.now() - tStart;
      entry.intendedHumanMs = Math.round(intendedDwellMs);
      entry.humanEquivalentMs = humanEquivMs;

      // Non-coach runs keep the lightweight read-and-maybe-reply behaviour.
      if (!coachAssist) {
        const chatReply = await maybeChatWithCoach(page, profile, decision, step, model, pace, piiRng);
        if (chatReply) entry.coachChat = chatReply;
      }

      // Decision: in-scope leave → stop here (no Weiter). Otherwise advance for real.
      if (effDisposition === "leave" || effAbandon) {
        entry.action = "abandon";
        if (entry.coach?.changed && entry.coach?.reconsideredAction === "abandon") entry.coachOutcome = "stayed_abandon";
        walk.push(entry);
        status = "dropped";
        stoppedAt = { step, page: page_.name, reason: effDisposition === "leave" ? "segment_dropoff" : "abandoned", reasonCode: reasonCode || "other", detail: entry.coach?.changeReason || entry.concern || entry.thoughts };
        break;
      }
      if (entry.coach && entry.coach.originalAction === "abandon" && !effAbandon) entry.coachOutcome = "rescued_to_continue";

      entry.action = "continue";
      walk.push(entry);

      const nextStep = expectedNext(step, sel);
      await clickCTA(page, pace);
      await page.locator("h2", { hasText: HEADINGS[nextStep] }).first().waitFor({ timeout: 12000 });
      step = nextStep;

      if (step === 7) {
        // advisory route: pick a Beratungsort then go to result (real)
        const t7 = Date.now();
        const ber7 = 6000 * tempo;
        humanEquivalentTotalMs += Math.round(ber7);
        await wander(page, piiRng, 2, pace);
        await actStep(page, 7, sel, piiRng, pace, log);
        await sleep(Math.max(0, ber7 * pace - (Date.now() - t7)));
        await clickCTA(page, pace);
        await page.locator("h2", { hasText: HEADINGS[8] }).first().waitFor({ timeout: 12000 });
        step = 8;
      }
      if (step === 8) break;
    }

    // Classify the terminal outcome from the REAL result screen.
    if (status !== "dropped") {
      const krankenhaus = !!sel.coverage?.krankenhaus;
      const others = sel.insuredPerson === "others";
      const offline = sel.tarif && OFFLINE_TARIFFS.includes(sel.tarif);
      const healthYes = sel.privatVersichert7 === "ja" || sel.antraegeAbgelehnt === "ja" || sel.besondereAnnahme === "ja";
      if (krankenhaus || others || offline || healthYes) {
        status = "out_of_scope";
        stoppedAt = {
          step: krankenhaus ? 0 : others ? 1 : offline ? 3 : 6,
          reason: krankenhaus ? "hospital" : others ? "others" : offline ? "offlineTariff" : "healthDeclaration",
          detail: krankenhaus ? "Krankenhaus-Versicherung gewählt" : others ? "Versicherung für andere Personen gewählt" : offline ? "Gewählter Tarif nur nach Beratung" : "Gesundheits-/Vorversicherungsfrage „ja“",
        };
      } else {
        status = "completed_online";
      }
    }

    const telemetry = await readTelemetry(page);
    return finalizeLive({ profile, archetype, sel, state, walk, status, stoppedAt, seed, model, telemetry, speedup: speedup || 1, humanEquivalentTotalMs, coachAssist });
  } finally {
    await context.close().catch(() => {});
  }
}

function finalizeLive({ profile, archetype, sel, state, walk, status, stoppedAt, seed, model, telemetry, speedup = 1, humanEquivalentTotalMs = 0, coachAssist = false }) {
  const tarif = sel.tarif || null;
  const estimated = tarif ? calcPremium(tarif, sel.addons || {}) : null;
  const premium = status === "completed_online" && state.finalPremium != null ? state.finalPremium : estimated;
  const recordedTotalMs = telemetry?.totalDurationMs || 0;
  const coachInteractions = walk.filter((w) => w.coach);
  const result = {
    runMode: coachAssist ? "live_ui_coached" : "live_ui",
    coachAssist,
    coachStats: coachAssist ? {
      interactions: coachInteractions.length,
      changedDecisions: coachInteractions.filter((w) => w.coach?.changed).length,
      rescuedToContinue: walk.filter((w) => w.coachOutcome === "rescued_to_continue").length,
      tarifSwitches: coachInteractions.filter((w) => w.coach?.choicePatch?.tarif).length,
    } : null,
    timeModel: {
      speedup,
      note:
        "Interactions, clicks, mouse movement and UI telemetry are REAL. Only the human reading/typing pauses " +
        "were compressed by `speedup`x to run many at once. humanEquivalentMs = the persona's own per-page " +
        "reading/deliberation estimate (at 1x) + realistic typing — i.e. the real-time this session represents.",
      recordedTotalMs,
      recordedTotalReadable: msToReadable(recordedTotalMs),
      humanEquivalentTotalMs,
      humanEquivalentTotalReadable: msToReadable(humanEquivalentTotalMs),
      perStep: walk.map((w) => ({ step: w.step, page: w.page, intendedHumanMs: w.intendedHumanMs ?? null, humanEquivalentMs: w.humanEquivalentMs ?? null, recordedCompressedMs: w.realCompressedMs ?? null })),
    },
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
    outcome: {
      tarif,
      tarifName: tarif ? TARIFFS[tarif]?.name : null,
      estimatedPremium: estimated,
      premiumPerMonth: premium,
      route: status === "completed_online" ? "online_purchase" : status === "out_of_scope" ? "consultation" : "abandoned",
      reachedStep: stoppedAt?.step ?? (status === "completed_online" ? 8 : null),
    },
    telemetry,          // ← the REAL UI tracking snapshot (real wall-clock time)
    selections: sel,
    walk,
    profile,
  };
  result.mood = analyzeMood(result);
  return result;
}

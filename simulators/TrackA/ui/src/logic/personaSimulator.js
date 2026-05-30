// Deterministic, data-grounded persona simulator.
//
// Given a persona (with its `sim` block derived from personas.json) and an
// optional sampled `personaProfile`, produces a session snapshot with the EXACT
// shape that useTracking emits. When a profile is provided, behaviour AND form
// fields are derived from that specific person — not just the segment archetype.

import { PAGE_NAMES } from "../logs/constants.js";
import { evaluateOutcome, calcPremium } from "./form.js";
import { buildSimFromProfile } from "./profileToSim.js";
import { formFillFromProfile } from "./profileFormFill.js";

const ONLINE_TARIFFS = ["start", "optimal"];

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function gauss(rng, mean, sdPct) {
  return Math.max(200, Math.round(mean + normal(rng) * mean * sdPct));
}

function gaussInt(rng, mean, sdPct = 0.5, min = 0) {
  const sd = Math.max(0.0001, mean * sdPct);
  return Math.max(min, Math.round(mean + normal(rng) * sd));
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries[0]?.[0];
}

/** Simulate typing — one event per character on the session timeline. */
function typeField(iso, tick, rng, fields, events, key, value, step, isPii = true) {
  const v = String(value ?? "");
  fields[key] = {
    changes: (fields[key]?.changes || 0) + Math.max(1, v.length),
    ...(isPii ? { filled: v.length > 0, length: v.length } : { value: v }),
  };
  for (let i = 1; i <= v.length; i++) {
    tick(40 + Math.floor(rng() * 80));
    events.push({
      t: iso(),
      type: "field",
      key,
      step,
      ...(isPii ? { length: i } : { value: v }),
    });
  }
}

/**
 * @param {object} persona — segment archetype from src/data/personas.js
 * @param {number} seed — reproducibility
 * @param {{ profile?: object, formFill?: object, mode?: string }} opts
 */
export function simulateSession(persona, seed, opts = {}) {
  const { profile = null, formFill: formFillOverride = null, mode = "sim" } = opts;
  const rng = makeRng(seed);

  const { sim } = profile ? buildSimFromProfile(persona.sim, profile) : { sim: persona.sim };
  const form = formFillOverride || (profile ? formFillFromProfile(profile, rng) : null);

  let t = Date.parse("2026-05-30T09:00:00.000Z") + (seed % 100000) * 1000;
  const iso = () => new Date(t).toISOString();
  const tick = (ms) => { t += ms; };

  const pages = {};
  const buttons = {};
  const fields = {};
  const hovers = [];
  const backPresses = [];
  const abandons = [];
  const events = [];
  const cursorByStep = {};
  let cursorMoves = 0, cursorDistancePx = 0;

  const startedAt = iso();

  const addEvent = (type, data = {}) => events.push({ t: iso(), type, ...data });
  const bumpButton = (key, data = {}) => {
    buttons[key] = (buttons[key] || 0) + 1;
    addEvent("button", { key, step: data.step, ...data });
  };
  const setField = (key, value, step) => {
    fields[key] = { changes: (fields[key]?.changes || 0) + 1, value: String(value ?? "") };
    addEvent("field", { key, step, value: String(value ?? "") });
  };
  const enterPage = (step) => {
    const prev = pages[step];
    pages[step] = { name: PAGE_NAMES[step], enters: (prev?.enters || 0) + 1, totalTimeMs: prev?.totalTimeMs || 0 };
    addEvent("page_enter", { step, name: PAGE_NAMES[step] });
  };
  const addDwell = (step, ms) => {
    if (step === 8) return;
    pages[step].totalTimeMs += ms;
  };
  const addHover = (target, step, dwellMs, extra = {}) => {
    const e = { t: iso(), target, dwellMs, step, ...extra };
    hovers.push(e);
    events.push({ ...e, type: "hover" });
  };
  const addCursor = (step, dwellMs) => {
    const moves = Math.max(1, Math.round((dwellMs / 1000) * 2 * sim.cursorMult));
    const dist = Math.round(moves * gaussInt(rng, 45, 0.4, 5));
    cursorByStep[step] = {
      moves: (cursorByStep[step]?.moves || 0) + moves,
      distancePx: (cursorByStep[step]?.distancePx || 0) + dist,
    };
    cursorMoves += moves;
    cursorDistancePx += dist;
  };

  let committedTarif = null;
  let selectedAddons = [];

  const stepInteractions = (step) => {
    if (!form) {
      // legacy placeholder path (no profile)
      if (step === 0) {
        bumpButton("coverage_toggle_arzt", { step, state: "on" });
        setField("coverage_arzt", "on", step);
        if (rng() < sim.bothCoverageProb) {
          bumpButton("coverage_toggle_krankenhaus", { step, state: "on" });
          setField("coverage_krankenhaus", "on", step);
        }
      } else if (step === 1) {
        bumpButton("insured_person_myself", { step });
        setField("insuredPerson", "myself", step);
      } else if (step === 2) {
        setField("geburtsdatum", "01.01.1985", step);
        setField("sozialversicherung", "ÖGK", step);
      } else if (step === 3) {
        runTariffStep(step);
      } else if (step === 5) {
        ["geschlecht", "vorname", "name", "svnummer", "email", "telefon", "groesse", "gewicht"].forEach((f) =>
          setField(f, f === "geschlecht" ? "männlich" : "x", step));
        setField("leistungssport", "nein", step);
        setField("schwangerschaft", "nein", step);
      } else if (step === 6) {
        setField("privatVersichert7", "nein", step);
        setField("antraegeAbgelehnt", "nein", step);
        setField("besondereAnnahme", "nein", step);
      }
      return;
    }

    if (step === 0) {
      if (form.coverage?.arzt) {
        bumpButton("coverage_toggle_arzt", { step, state: "on" });
        setField("coverage_arzt", "on", step);
      }
      if (form.coverage?.krankenhaus) {
        bumpButton("coverage_toggle_krankenhaus", { step, state: "on" });
        setField("coverage_krankenhaus", "on", step);
      }
    } else if (step === 1) {
      bumpButton(`insured_person_${form.insuredPerson || "myself"}`, { step });
      setField("insuredPerson", form.insuredPerson || "myself", step);
    } else if (step === 2) {
      typeField(iso, tick, rng, fields, events, "geburtsdatum", form.geburtsdatum, step);
      setField("sozialversicherung", form.sozialversicherung, step);
    } else if (step === 3) {
      runTariffStep(step, form.tarif);
    } else if (step === 4) {
      const addonKeys = Object.entries(form.addons || {}).filter(([, v]) => v).map(([k]) => k);
      const churn = Math.max(addonKeys.length, gaussInt(rng, sim.addonChurnMean, 0.5));
      for (let i = 0; i < churn; i++) {
        const k = addonKeys[i % Math.max(1, addonKeys.length)] || "fit";
        const on = i < addonKeys.length;
        bumpButton(`addon_toggle_${k}`, { step, state: on ? "on" : "off" });
        if (on) selectedAddons.push(k);
      }
      selectedAddons = [...new Set(selectedAddons)];
      if (rng() < sim.backProbStep4) {
        tick(800);
        backPresses.push({ t: iso(), step, page: PAGE_NAMES[step], pageName: PAGE_NAMES[step], timeOnPageMs: gauss(rng, 10000, 0.4) });
        bumpButton("back", { step });
        enterPage(step);
      }
    } else if (step === 5) {
      typeField(iso, tick, rng, fields, events, "vorname", form.vorname, step);
      typeField(iso, tick, rng, fields, events, "name", form.name, step);
      typeField(iso, tick, rng, fields, events, "svnummer", form.svnummer, step);
      typeField(iso, tick, rng, fields, events, "email", form.email, step);
      typeField(iso, tick, rng, fields, events, "telefon", form.telefon, step);
      typeField(iso, tick, rng, fields, events, "groesse", form.groesse, step);
      typeField(iso, tick, rng, fields, events, "gewicht", form.gewicht, step);
      setField("geschlecht", form.geschlecht, step);
      setField("leistungssport", form.leistungssport, step);
      setField("schwangerschaft", form.schwangerschaft, step);
    } else if (step === 6) {
      setField("privatVersichert7", form.privatVersichert7, step);
      setField("antraegeAbgelehnt", form.antraegeAbgelehnt, step);
      setField("besondereAnnahme", form.besondereAnnahme, step);
    }
  };

  function runTariffStep(step, preferredTarif) {
    const nHover = gaussInt(rng, sim.tarifHoversMean, 0.4);
    for (let i = 0; i < nHover; i++) {
      const key = pickWeighted(rng, sim.tarifWeights);
      tick(800);
      addHover(`tarif_card_${key}`, step, gauss(rng, 3500, 0.5), { tarif: key, online: ONLINE_TARIFFS.includes(key) });
    }
    if (rng() < sim.advisoryHoverProb) {
      tick(600);
      addHover("advisory_badge_optplus", step, gauss(rng, 3000, 0.5), { tarif: "optplus", online: false });
    }
    const nSwitch = preferredTarif ? Math.max(1, gaussInt(rng, sim.tarifSwitchesMean, 0.6)) : gaussInt(rng, sim.tarifSwitchesMean, 0.6);
    for (let i = 0; i < nSwitch; i++) {
      const key = i === nSwitch - 1 && preferredTarif ? preferredTarif : pickWeighted(rng, sim.tarifWeights);
      tick(1500);
      bumpButton(`tarif_select_${key}`, { step });
      setField("tarif", key, step);
      committedTarif = key;
    }
    if (!committedTarif && preferredTarif) {
      bumpButton(`tarif_select_${preferredTarif}`, { step });
      setField("tarif", preferredTarif, step);
      committedTarif = preferredTarif;
    }
    if (rng() < sim.backProbStep3) {
      tick(1000);
      backPresses.push({ t: iso(), step, page: PAGE_NAMES[step], pageName: PAGE_NAMES[step], timeOnPageMs: gauss(rng, 20000, 0.4) });
      bumpButton("back", { step });
      enterPage(step);
    }
    if (rng() < sim.ctaHesitationProb) {
      tick(400);
      addHover("cta_weiter", step, gauss(rng, 600, 0.5), { label: "Weiter" });
    }
  }

  // Krankenhaus selected at step 0 → outcome (step 8), including arzt+krankenhaus
  if (form?.coverage?.krankenhaus) {
    enterPage(0);
    stepInteractions(0);
    const dwellMs = gauss(rng, sim.dwell[0], sim.dwellSdPct);
    addDwell(0, dwellMs);
    addCursor(0, dwellMs);
    tick(dwellMs);
    enterPage(8);
    addEvent("funnel_complete", { step: 8, route: "beratung", tarif: form.tarif, reasons: ["Krankenhaus-Versicherung gewählt"] });
    return buildResult(persona, seed, { mode, profile, form, startedAt, t, pages, buttons, fields, hovers, cursorByStep, cursorMoves, cursorDistancePx, backPresses, abandons, events, currentStep: 8, completed: true, route: "beratung", committedTarif: form.tarif, selectedAddons: [] });
  }

  const order = [0, 1, 2, 3, 4, 5, 6];
  let dropStep = null;
  for (const step of order) {
    enterPage(step);
    const dwellMs = gauss(rng, sim.dwell[step], sim.dwellSdPct);
    stepInteractions(step);
    addDwell(step, dwellMs);
    addCursor(step, dwellMs);
    tick(dwellMs);
    if (rng() >= sim.continueProb[step]) { dropStep = step; break; }
    bumpButton("next", { step, from: step });
  }

  let route = "online";
  let completed = false;
  if (dropStep === null) {
    completed = true;
    if (!committedTarif) committedTarif = form?.tarif || pickWeighted(rng, { start: sim.tarifWeights.start, optimal: sim.tarifWeights.optimal });
    if (form) {
      const oc = evaluateOutcome({ ...form, tarif: committedTarif, coverage: form.coverage || { arzt: true, krankenhaus: false } });
      route = oc.route;
    }
    enterPage(8);
    const premium = calcPremium(committedTarif, form?.addons || {});
    addEvent("funnel_complete", { step: 8, route, tarif: committedTarif, premium: Number(premium.toFixed(2)), addons: selectedAddons, reasons: route === "beratung" ? evaluateOutcome({ ...form, tarif: committedTarif }).reasons : [] });
  } else {
    abandons.push({ t: iso(), step: dropStep, page: PAGE_NAMES[dropStep] });
    addEvent("abandon", { step: dropStep, page: PAGE_NAMES[dropStep] });
  }

  return buildResult(persona, seed, {
    mode, profile, form, startedAt, t, pages, buttons, fields, hovers, cursorByStep, cursorMoves, cursorDistancePx,
    backPresses, abandons, events, currentStep: completed ? 8 : dropStep, completed, route, committedTarif, selectedAddons,
  });
}

function buildResult(persona, seed, ctx) {
  const {
    mode, profile, form, startedAt, t, pages, buttons, fields, hovers, cursorByStep, cursorMoves, cursorDistancePx,
    backPresses, abandons, events, currentStep, completed, route, committedTarif, selectedAddons,
  } = ctx;
  const cursor = { totalMoves: cursorMoves, totalDistancePx: cursorDistancePx, byStep: cursorByStep };
  const totalBtn = Object.values(buttons).reduce((s, n) => s + n, 0);

  return {
    sessionId: `${mode === "agent" ? "agent" : "sim"}_${persona.id}_${seed}`,
    simulatedPersona: persona.id,
    startedAt,
    snapshotAt: isoFromMs(t),
    totalDurationMs: t - Date.parse(startedAt),
    mode,
    currentStep,
    currentPage: PAGE_NAMES[currentStep],
    completed,
    formChoices: form ? { tarif: committedTarif || form.tarif, route, addons: selectedAddons } : undefined,
    summary: {
      pagesVisited: Object.keys(pages).length,
      totalButtonClicks: totalBtn,
      backButtonClicks: buttons.back || 0,
      backPresses: backPresses.length,
      fieldsInteracted: Object.keys(fields).length,
      events: events.length,
      hovers: hovers.length,
      abandons: abandons.length,
      cursorMoves: cursor.totalMoves,
      cursorDistancePx: cursor.totalDistancePx,
      selectedTarif: committedTarif || form?.tarif || "optimal",
      selectedAddons,
      projectedRoute: route,
    },
    pages,
    buttons,
    fields,
    hovers,
    cursor,
    backPresses,
    abandons,
    events,
  };
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

export function runBatch(persona, n, seedBase = 1, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(simulateSession(persona, seedBase + i * 7919, opts));
  return out;
}

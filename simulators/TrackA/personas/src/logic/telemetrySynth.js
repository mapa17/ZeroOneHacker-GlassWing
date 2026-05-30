// Builds a UI-shaped behavioural log (ui/src/logs/useTracking.js) for a persona's
// page-by-page walk.
//
// TIME IS REAL, NOT ESTIMATED. The time on each page = `entry.thinkingMs`, the
// actual wall-clock latency of that screen's reasoning LLM call (measured in
// decideJSON). Token usage per step (esp. reasoning tokens) is a second real
// measure of how much the persona deliberated. There is NO hand-tuned time model
// anymore — different personas naturally get different times because they actually
// reason for different amounts of time / tokens.
//
// What is still synthesised (and clearly marked): the discrete UI interaction
// MARKERS — which buttons were pressed, which cards were hovered, which fields were
// filled, and the back-navigations the persona expressed ("let me re-check"). These
// are placed as timestamped events WITHIN each step's real time window; they do not
// add or invent any duration. The cursor figure is an explicit movement proxy
// (the real UI also stores only aggregate moves/distance, never coordinates).

import { makeRng } from "./personaProfileGenerator.js";
import { PAGE_NAMES, PII_FIELDS, msToReadable, dwellLevel } from "../logs/constants.js";
import { TARIFFS, ADDONS } from "./funnelPages.js";

const RECHECK_RE = /zurück|nochmal|noch mal|re-?check|vergleich|schau.*wieder|wieder.*anschau/i;
// Typical human seconds per page — a REFERENCE only, so measured reasoning time can
// be compared to how long a real person takes (the model thinks faster than a human).
export const STEP_BENCHMARK_SEC = { 0: 10, 1: 6, 2: 18, 3: 55, 4: 22, 5: 50, 6: 24, 7: 9 };

export function synthesizeTelemetry({ profile, selections = {}, walk = [], status, stoppedAt, outcome = {}, seed = 1 } = {}) {
  // RNG is used ONLY to place synthetic interaction markers (which card hovered
  // first, etc.) — never to generate time. Time comes from measured latency.
  const rng = makeRng((seed + 7777) >>> 0);

  const base = Date.now();
  let clock = base;

  const pages = {};
  const buttons = {};
  const fields = {};
  const hovers = [];
  const backPresses = [];
  const abandons = [];
  const events = [];
  const cursorByStep = {};
  let totalMoves = 0;
  let totalDistance = 0;
  let active = 0;

  const ensurePage = (s) => { pages[s] = pages[s] || { name: PAGE_NAMES[s], enters: 0, totalTimeMs: 0 }; return pages[s]; };
  // Event with an explicit timestamp (markers do NOT advance the clock).
  const evAt = (tMs, type, data = {}) => events.push({ t: new Date(tMs).toISOString(), type, ...data });
  const enterPageAt = (s, tMs) => { ensurePage(s).enters += 1; evAt(tMs, "page_enter", { step: s, name: PAGE_NAMES[s] }); active = s; };
  const btnAt = (tMs, key, data = {}) => { buttons[key] = (buttons[key] || 0) + 1; evAt(tMs, "button", { key, step: active, ...data }); };
  const fieldAt = (tMs, key, value) => {
    const isPII = PII_FIELDS.has(key);
    const v = String(value ?? "");
    const prev = fields[key] || { changes: 0, firstAt: new Date(tMs).toISOString() };
    const stat = { ...prev, changes: prev.changes + 1, lastAt: new Date(tMs).toISOString() };
    if (isPII) { stat.filled = v.length > 0; stat.length = v.length; }
    else { stat.value = v; }
    fields[key] = stat;
    evAt(tMs, "field", { key, step: active, ...(isPII ? { length: v.length } : { value: v }) });
  };
  const hoverAt = (tMs, target, dwellMs, meta = {}) => {
    const d = Math.round(dwellMs);
    hovers.push({ t: new Date(tMs).toISOString(), target, dwellMs: d, dwellReadable: msToReadable(d), step: active, ...meta });
    evAt(tMs, "hover", { target, dwellMs: d, dwellReadable: msToReadable(d), step: active, ...meta });
  };
  const addCursor = (s, measuredMs, extra = 0) => {
    // proxy: more time on a page → more idle mouse movement (real UI stores the same
    // aggregate, never coordinates). Scaled by the REAL measured time.
    const m = Math.max(1, Math.round((measuredMs / 1000) * (3 + rng() * 4) + extra));
    const d = Math.round(m * (40 + rng() * 70));
    const b = cursorByStep[s] || { moves: 0, distancePx: 0 };
    b.moves += m; b.distancePx += d;
    cursorByStep[s] = b; totalMoves += m; totalDistance += d;
  };

  walk.forEach((entry) => {
    const step = entry.step;
    const considered = Array.isArray(entry.considered) ? entry.considered.length : 0;
    // REAL measured thinking time for this screen (ms). Fallback to 0 if missing.
    const measuredMs = Math.max(0, Math.round(Number(entry.thinkingMs) || 0));
    const winStart = clock;
    const at = (frac) => winStart + Math.round(measuredMs * Math.min(1, Math.max(0, frac)));

    enterPageAt(step, winStart);
    ensurePage(step).totalTimeMs += measuredMs;

    // re-check beats the persona actually expressed become real back-navigations.
    let backs = (entry.deliberation || []).filter((b) => RECHECK_RE.test(String(b))).length;
    backs = Math.min(backs, step === 0 ? 0 : 2);

    // ---- interaction markers, placed within the real time window -----------
    if (step === 0) {
      hoverAt(at(0.15), "coverage_card_arzt", Math.min(measuredMs * 0.25, 4000), { coverage: "arzt" });
      hoverAt(at(0.3), "coverage_card_krankenhaus", Math.min(measuredMs * 0.2, 3000), { coverage: "krankenhaus" });
      const cov = selections.coverage || {};
      Object.entries(cov).filter(([, on]) => on).forEach(([k], i) => { btnAt(at(0.7 + i * 0.05), `coverage_toggle_${k}`, { state: "on" }); fieldAt(at(0.72 + i * 0.05), `coverage_${k}`, "on"); });
    } else if (step === 1) {
      const ip = selections.insuredPerson || "myself";
      btnAt(at(0.7), `insured_person_${ip}`);
      fieldAt(at(0.75), "insuredPerson", ip);
    } else if (step === 2) {
      fieldAt(at(0.4), "geburtsdatum", selections.geburtsdatum || "");
      fieldAt(at(0.7), "sozialversicherung", selections.sozialversicherung || "ÖGK");
    } else if (step === 3) {
      const cards = (entry.considered || []).map((c) => c.tarif).filter(Boolean);
      const toHover = cards.length ? cards : ["start", "optimal", "optplus", "premium"];
      toHover.forEach((k, i) => {
        const c = (entry.considered || []).find((x) => x.tarif === k);
        const richness = c ? String(c.gets || "").length + String(c.missing || "").length : 60;
        hoverAt(at(0.1 + i * 0.12), `tarif_card_${k}`, Math.min(measuredMs * 0.15, 1000 + richness * 12), { tarif: k, online: TARIFFS[k]?.online });
      });
      if (selections.tarif) btnAt(at(0.85), `tarif_select_${selections.tarif}`);
    } else if (step === 4) {
      const addons = selections.addons || {};
      Object.entries(addons).filter(([, on]) => on).forEach(([k], i) => btnAt(at(0.6 + i * 0.05), `addon_toggle_${k}`, { state: "on" }));
      if (rng() < 0.3) { const k = Object.keys(ADDONS)[Math.floor(rng() * Object.keys(ADDONS).length)]; btnAt(at(0.7), `addon_toggle_${k}`, { state: "on" }); btnAt(at(0.78), `addon_toggle_${k}`, { state: "off" }); }
    } else if (step === 5) {
      const piiKeys = ["vorname", "name", "geschlecht", "svnummer", "email", "telefon", "groesse", "gewicht", "leistungssport", "schwangerschaft"].filter((k) => selections[k] != null && selections[k] !== "");
      piiKeys.forEach((k, i) => fieldAt(at(0.2 + (i / Math.max(1, piiKeys.length)) * 0.6), k, selections[k]));
    } else if (step === 6) {
      ["privatVersichert7", "antraegeAbgelehnt", "besondereAnnahme"].filter((k) => selections[k] != null).forEach((k, i) => fieldAt(at(0.4 + i * 0.15), k, selections[k]));
    }

    // ---- real back-navigations: leave to previous page, then return --------
    for (let i = 0; i < backs; i += 1) {
      const prev = Math.max(0, step - 1);
      const tBack = at(0.9 + i * 0.03);
      const sessionElapsedMs = tBack - base;
      const e = {
        t: new Date(tBack).toISOString(), step, page: PAGE_NAMES[step], pageName: PAGE_NAMES[step],
        timeOnPageMs: tBack - winStart, timeOnPageReadable: msToReadable(tBack - winStart),
        sessionElapsedMs, sessionElapsedReadable: msToReadable(sessionElapsedMs),
      };
      backPresses.push(e);
      buttons.back = (buttons.back || 0) + 1;
      evAt(tBack, "button", { key: "back", ...e });
      enterPageAt(prev, tBack);          // actually land on the previous page
      btnAt(tBack, "next", { from: prev, viaBack: true });
      enterPageAt(step, tBack);          // and return (within the same real window)
    }

    addCursor(step, measuredMs, backs * 8 + considered * 3);

    pages[step].dwellReadable = msToReadable(pages[step].totalTimeMs);
    pages[step].thinkingMs = (pages[step].thinkingMs || 0) + measuredMs;
    pages[step].measuredReasoningMs = (pages[step].measuredReasoningMs || 0) + measuredMs;
    pages[step].thinkingReadable = msToReadable(pages[step].thinkingMs);
    pages[step].backPresses = (pages[step].backPresses || 0) + backs;
    pages[step].deliberationBeats = Array.isArray(entry.deliberation) ? entry.deliberation.length : 0;
    pages[step].tokens = entry.tokens || null;
    pages[step].level = dwellLevel(step, pages[step].totalTimeMs);

    clock = winStart + measuredMs; // advance by the REAL measured time only
    if (entry.action === "continue") btnAt(clock, "next", { from: step });
  });

  // ---- terminal tail (no LLM reasoning here, so no measured time added) ----
  if (status === "completed_online") {
    [7, 8].forEach((s) => { enterPageAt(s, clock); ensurePage(s); });
    evAt(clock, "funnel_complete", {
      route: outcome.route || "online_purchase",
      tarif: selections.tarif || null,
      premium: outcome.finalPremium ?? outcome.premiumPerMonth ?? null,
      addons: Object.keys(selections.addons || {}).filter((k) => selections.addons[k]),
    });
  } else if (status === "dropped") {
    const s = stoppedAt?.step ?? active;
    const sessionElapsedMs = clock - base;
    const e = { t: new Date(clock).toISOString(), step: s, page: PAGE_NAMES[s], sessionElapsedMs, sessionElapsedReadable: msToReadable(sessionElapsedMs) };
    abandons.push(e);
    evAt(clock, "abandon", e);
    if (rng() < 0.5) btnAt(clock, "cancel", { from: s, page: PAGE_NAMES[s], reasonCode: stoppedAt?.reasonCode });
  } else if (status === "out_of_scope") {
    const s = stoppedAt?.step ?? active;
    evAt(clock, "routed_to_consultation", { step: s, page: PAGE_NAMES[s], reason: stoppedAt?.reason });
  }

  const timePerStep = Object.keys(pages)
    .map(Number)
    .sort((a, b) => a - b)
    .map((s) => ({
      step: s,
      page: PAGE_NAMES[s],
      measuredReasoningMs: pages[s].measuredReasoningMs || 0,
      timeOnPageMs: pages[s].totalTimeMs,
      timeOnPageReadable: msToReadable(pages[s].totalTimeMs),
      humanBenchmarkSec: STEP_BENCHMARK_SEC[s] ?? null,
      tokens: pages[s].tokens || null,
      enters: pages[s].enters,
      deliberationBeats: pages[s].deliberationBeats || 0,
      backPresses: pages[s].backPresses || 0,
      level: pages[s].level || dwellLevel(s, pages[s].totalTimeMs),
    }));

  const totalButtonClicks = Object.values(buttons).reduce((sum, n) => sum + n, 0);
  const totalDurationMs = clock - base;
  const totalReasoningTokens = walk.reduce((sum, e) => sum + (e.tokens?.completion || 0), 0);

  return {
    sessionId: `sim_${seed}_${Math.floor(rng() * 1e6).toString(36)}`,
    startedAt: new Date(base).toISOString(),
    snapshotAt: new Date(clock).toISOString(),
    timeSource: "measured_llm_reasoning_latency",
    totalDurationMs,
    totalDurationReadable: msToReadable(totalDurationMs),
    mode: "persona_sim",
    currentStep: active,
    currentPage: PAGE_NAMES[active],
    summary: {
      pagesVisited: Object.keys(pages).length,
      totalButtonClicks,
      backButtonClicks: buttons.back || 0,
      backPresses: backPresses.length,
      fieldsInteracted: Object.keys(fields).length,
      events: events.length,
      hovers: hovers.length,
      abandons: abandons.length,
      cursorMoves: totalMoves,
      cursorDistancePx: totalDistance,
      totalReasoningTokens,
      selectedTarif: selections.tarif || null,
      selectedAddons: Object.keys(selections.addons || {}).filter((k) => selections.addons[k]),
    },
    timePerStep,
    pages,
    buttons,
    backPresses,
    fields,
    hovers,
    cursor: { totalMoves, totalDistancePx: totalDistance, byStep: cursorByStep },
    abandons,
    events,
  };
}

import { useState, useEffect, useRef, useCallback } from "react";
import { ADDONS } from "../data/product.js";
import {
  PAGE_NAMES, PII_FIELDS, newSessionId, msToReadable, freshAnalytics, HOVER_MIN_MS,
} from "./constants.js";

// Steps whose dwell time must NOT be counted. Step 8 (Ergebnis) is reached only
// after the funnel is completed — time spent reading the result is not part of
// the conversion journey, so we exclude it from all time accounting.
const NO_TIME_STEPS = new Set([8]);

const freshCursor = () => ({ byStep: {}, totalMoves: 0, totalDistancePx: 0, lastX: null, lastY: null, lastT: 0 });

export function useTracking({ step, form, mode, outcome, premium, decorate }) {
  const [analytics, setAnalytics] = useState(freshAnalytics());
  const sessionRef = useRef({ sessionId: newSessionId(), startedAt: new Date().toISOString() });
  const stepEnterRef = useRef({ step: 0, at: Date.now() });
  const hoverRef = useRef({});
  const cursorRef = useRef(freshCursor());
  const [tick, setTick] = useState(0);
  // Bumps on mouse/hover/click so Coach re-evaluates without waiting for 1s tick.
  const [livePulse, setLivePulse] = useState(0);
  const bumpLiveRef = useRef(0);
  const bumpLive = useCallback(() => {
    const now = Date.now();
    if (now - bumpLiveRef.current < 180) return;
    bumpLiveRef.current = now;
    setLivePulse((p) => p + 1);
  }, []);

  const trackEvent = useCallback((type, data = {}) => {
    bumpLive();
    setAnalytics((a) => ({
      ...a,
      events: [...a.events, { t: new Date().toISOString(), type, step: stepEnterRef.current.step, ...data }],
    }));
  }, [bumpLive]);

  const trackButton = useCallback((key, data = {}) => {
    bumpLive();
    setAnalytics((a) => ({
      ...a,
      buttons: { ...a.buttons, [key]: (a.buttons[key] || 0) + 1 },
      events: [...a.events, { t: new Date().toISOString(), type: "button", key, step: stepEnterRef.current.step, ...data }],
    }));
  }, [bumpLive]);

  const trackBackPress = useCallback((fromStep, timeOnPageMs) => {
    const pageName = PAGE_NAMES[fromStep];
    const sessionElapsedMs = Date.now() - Date.parse(sessionRef.current.startedAt);
    const entry = {
      t: new Date().toISOString(),
      step: fromStep,
      page: pageName,
      pageName,
      timeOnPageMs,
      timeOnPageReadable: msToReadable(timeOnPageMs),
      sessionElapsedMs,
      sessionElapsedReadable: msToReadable(sessionElapsedMs),
    };
    setAnalytics((a) => ({
      ...a,
      buttons: { ...a.buttons, back: (a.buttons.back || 0) + 1 },
      backPresses: [...a.backPresses, entry],
      events: [...a.events, { t: entry.t, type: "button", key: "back", ...entry }],
    }));
    bumpLive();
  }, [bumpLive]);

  const trackField = useCallback((key, value) => {
    bumpLive();
    setAnalytics((a) => {
      const isPII = PII_FIELDS.has(key);
      const v = String(value ?? "");
      const prev = a.fields[key] || { changes: 0, firstAt: new Date().toISOString() };
      const stat = { ...prev, changes: prev.changes + 1, lastAt: new Date().toISOString() };
      if (isPII) { stat.filled = v.length > 0; stat.length = v.length; }
      else { stat.value = v; }
      return {
        ...a,
        fields: { ...a.fields, [key]: stat },
        events: [
          ...a.events,
          { t: new Date().toISOString(), type: "field", key, step: stepEnterRef.current.step,
            ...(isPII ? { length: v.length } : { value: v }) },
        ],
      };
    });
  }, [bumpLive]);

  // Hover intent: enter records a start time; leave computes dwell and logs it.
  // Sub-threshold hovers (incidental pass-throughs) are discarded.
  const trackHoverEnter = useCallback((target) => {
    hoverRef.current[target] = Date.now();
    bumpLive();
  }, [bumpLive]);

  const trackHoverLeave = useCallback((target, meta = {}) => {
    const start = hoverRef.current[target];
    if (!start) return;
    delete hoverRef.current[target];
    const dwellMs = Date.now() - start;
    if (dwellMs < HOVER_MIN_MS) return;
    const entry = {
      t: new Date().toISOString(), target, dwellMs,
      dwellReadable: msToReadable(dwellMs), step: stepEnterRef.current.step, ...meta,
    };
    bumpLive();
    setAnalytics((a) => ({
      ...a,
      hovers: [...a.hovers, entry],
      events: [...a.events, { ...entry, type: "hover" }],
    }));
  }, [bumpLive]);

  // Records that the user left the funnel at `fromStep` without completing it.
  const trackAbandon = useCallback((fromStep) => {
    const sessionElapsedMs = Date.now() - Date.parse(sessionRef.current.startedAt);
    const entry = {
      t: new Date().toISOString(),
      step: fromStep,
      page: PAGE_NAMES[fromStep],
      sessionElapsedMs,
      sessionElapsedReadable: msToReadable(sessionElapsedMs),
    };
    setAnalytics((a) => ({
      ...a,
      abandons: [...a.abandons, entry],
      events: [...a.events, { ...entry, type: "abandon" }],
    }));
  }, []);

  // ---- raw cursor movement tracking ----------------------------------------
  // We do NOT store coordinates (privacy + size). Instead we accumulate, per
  // funnel step, the number of meaningful moves and total travelled distance.
  // This captures "moving around the page without clicking" — a hesitation
  // signal that pure click/hover tracking misses. Stored in a ref so the high
  // frequency of mousemove never triggers a React re-render.
  useEffect(() => {
    const onMove = (e) => {
      const now = Date.now();
      const c = cursorRef.current;
      if (now - c.lastT < 60) { c.lastX = e.clientX; c.lastY = e.clientY; return; }
      let moved = false;
      if (c.lastX != null) {
        const dx = e.clientX - c.lastX;
        const dy = e.clientY - c.lastY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= 3) {
          const s = stepEnterRef.current.step;
          const b = c.byStep[s] || { moves: 0, distancePx: 0 };
          b.moves += 1;
          b.distancePx += dist;
          c.byStep[s] = b;
          c.totalMoves += 1;
          c.totalDistancePx += dist;
          moved = true;
        }
      }
      c.lastX = e.clientX;
      c.lastY = e.clientY;
      c.lastT = now;
      if (moved && (mode === "coach" || mode === "manual")) bumpLive();
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mode, bumpLive]);

  // per-page dwell: finalise the page we are leaving, register the new entry
  useEffect(() => {
    const now = Date.now();
    const prev = stepEnterRef.current;
    setAnalytics((a) => {
      const pages = { ...a.pages };
      if (prev.step !== step && !NO_TIME_STEPS.has(prev.step)) {
        const spent = now - prev.at;
        const pp = pages[prev.step] || { name: PAGE_NAMES[prev.step], enters: 0, totalTimeMs: 0 };
        pages[prev.step] = { ...pp, totalTimeMs: pp.totalTimeMs + spent };
      }
      const cp = pages[step] || { name: PAGE_NAMES[step], enters: 0, totalTimeMs: 0 };
      pages[step] = { ...cp, enters: cp.enters + 1 };
      return {
        ...a,
        pages,
        events: [...a.events, { t: new Date().toISOString(), type: "page_enter", step, name: PAGE_NAMES[step] }],
      };
    });
    stepEnterRef.current = { step, at: now };
  }, [step]);

  useEffect(() => {
    if (step !== 8) return;
    trackEvent("funnel_complete", {
      route: outcome.route,
      tarif: form.tarif,
      premium: Number(premium.toFixed(2)),
      addons: ADDONS.filter((a) => form.addons[a.key]).map((a) => a.key),
      reasons: outcome.reasons,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (mode !== "data" && mode !== "coach") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [mode]);

  const buildSnapshot = useCallback(() => {
    const now = Date.now();
    const pages = {};
    Object.keys(analytics.pages).forEach((k) => { pages[k] = { ...analytics.pages[k] }; });
    const curStep = stepEnterRef.current.step;
    const cur = pages[curStep] || { name: PAGE_NAMES[curStep], enters: 1, totalTimeMs: 0 };
    // Only add live dwell for pages that are counted (i.e. not the result page).
    const live = NO_TIME_STEPS.has(curStep) ? 0 : now - stepEnterRef.current.at;
    pages[curStep] = { ...cur, totalTimeMs: (cur.totalTimeMs || 0) + live, current: true };

    const startMs = Date.parse(sessionRef.current.startedAt);
    const totalBtn = Object.values(analytics.buttons).reduce((s, n) => s + n, 0);

    const c = cursorRef.current;
    const cursorByStep = {};
    Object.keys(c.byStep).forEach((k) => {
      cursorByStep[k] = { moves: c.byStep[k].moves, distancePx: Math.round(c.byStep[k].distancePx) };
    });
    const cursor = {
      totalMoves: c.totalMoves,
      totalDistancePx: Math.round(c.totalDistancePx),
      byStep: cursorByStep,
      // Normalised position (0–100) for live coach — no raw coords stored in export history.
      positionPct: {
        x: Math.round((c.lastX / Math.max(window.innerWidth, 1)) * 1000) / 10,
        y: Math.round((c.lastY / Math.max(window.innerHeight, 1)) * 1000) / 10,
      },
    };

    const nowMs = Date.now();
    const activeHovers = Object.entries(hoverRef.current).map(([target, since]) => ({
      target,
      dwellMs: nowMs - since,
      step: stepEnterRef.current.step,
    }));

    const stepCursor = cursorByStep[curStep] || { moves: 0, distancePx: 0 };
    const hoversOnStep = analytics.hovers.filter((h) => h.step === curStep).length;

    return {
      sessionId: sessionRef.current.sessionId,
      startedAt: sessionRef.current.startedAt,
      snapshotAt: new Date().toISOString(),
      totalDurationMs: now - startMs,
      mode,
      currentStep: curStep,
      currentPage: PAGE_NAMES[curStep],
      summary: {
        pagesVisited: Object.keys(analytics.pages).length,
        totalButtonClicks: totalBtn,
        backButtonClicks: analytics.buttons.back || 0,
        backPresses: analytics.backPresses.length,
        fieldsInteracted: Object.keys(analytics.fields).length,
        events: analytics.events.length,
        hovers: analytics.hovers.length,
        abandons: analytics.abandons.length,
        cursorMoves: cursor.totalMoves,
        cursorDistancePx: cursor.totalDistancePx,
        selectedTarif: form.tarif,
        selectedAddons: ADDONS.filter((a) => form.addons[a.key]).map((a) => a.key),
        projectedRoute: outcome.route,
      },
      pages,
      buttons: analytics.buttons,
      backPresses: analytics.backPresses,
      fields: analytics.fields,
      hovers: analytics.hovers,
      cursor,
      activeHovers,
      liveOnStep: {
        step: curStep,
        pageDwellMs: pages[curStep]?.totalTimeMs || 0,
        cursorMoves: stepCursor.moves || 0,
        cursorDistancePx: stepCursor.distancePx || 0,
        hoversCompleted: hoversOnStep,
        activeHoverCount: activeHovers.length,
      },
      abandons: analytics.abandons,
      events: analytics.events,
    };
  }, [analytics, form, mode, outcome.route]);

  // The export report adds the decorate() layer (e.g. persona analysis) on top
  // of the raw telemetry, so a downloaded JSON explains *who* the user is.
  const buildReport = useCallback(() => {
    const base = buildSnapshot();
    return decorate ? decorate(base) : base;
  }, [buildSnapshot, decorate]);

  const snapshotText = useCallback(
    () => JSON.stringify(buildReport(), null, 2),
    [buildReport],
  );

  const downloadJSON = useCallback(() => {
    const blob = new Blob([snapshotText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionRef.current.sessionId}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, [snapshotText]);

  const resetTracking = useCallback((currentStep) => {
    sessionRef.current = { sessionId: newSessionId(), startedAt: new Date().toISOString() };
    stepEnterRef.current = { step: currentStep, at: Date.now() };
    cursorRef.current = freshCursor();
    setAnalytics(freshAnalytics());
  }, []);

  return {
    tick,
    livePulse,
    trackEvent,
    trackButton,
    trackBackPress,
    trackField,
    trackHoverEnter,
    trackHoverLeave,
    trackAbandon,
    buildSnapshot,
    buildReport,
    snapshotText,
    downloadJSON,
    resetTracking,
    sessionRef,
    stepEnterRef,
  };
}

// When should the coach speak proactively? Only on meaningful signals — never on cursor noise.

import { buildDynamicStepHint } from "./coachScreenContext.js";

export { buildDynamicStepHint };

const MIN_PROACTIVE_MS = 90000;
const STUCK_TARIFF_MS = 50000;

function effectiveTarif(snap) {
  const step = snap.currentStep ?? 0;
  const clicked = Object.keys(snap.buttons || {}).some((k) => k.startsWith("tarif_select_"));
  const raw = snap.summary?.selectedTarif || null;
  return (step >= 3 || clicked) ? raw : null;
}

/**
 * @param {object} snap
 * @param {object} state
 */
export function detectProactiveReason(snap, state) {
  const step = snap.currentStep ?? 0;
  const sum = snap.summary || {};
  const live = snap.liveOnStep || {};
  const clicks = sum.totalButtonClicks || 0;
  const backClicks = sum.backButtonClicks || 0;
  const tarif = effectiveTarif(snap);
  const advisoryHover = (snap.activeHovers || []).some(
    (h) => (h.target || "").includes("advisory") || (h.target || "").startsWith("advisory_badge_"),
  );
  const dwell = live.pageDwellMs || 0;

  const now = Date.now();
  const sameStep = state.lastProactiveStep === step;
  if (sameStep && state.lastProactiveAt && now - state.lastProactiveAt < MIN_PROACTIVE_MS) {
    state.clicks = clicks;
    state.backClicks = backClicks;
    state.tarif = tarif;
    state.advisoryHover = advisoryHover;
    return null;
  }

  let reason = null;

  if (backClicks > (state.backClicks ?? 0)) {
    reason = "back_navigation";
  } else if (tarif && tarif !== state.tarif) {
    reason = "tariff_selected";
  } else if (advisoryHover && !state.advisoryHover && step === 3) {
    reason = "advisory_tariff_hover";
  } else if (step === 3 && !tarif && dwell >= STUCK_TARIFF_MS && !state.stuckTariffFired) {
    reason = "stuck_on_tariff";
    state.stuckTariffFired = true;
  } else if (step === 6 && dwell >= 35000 && !state.step6HesitationFired && clicks > (state.clicks ?? 0)) {
    reason = "hesitation_step6";
    state.step6HesitationFired = true;
  }

  state.clicks = clicks;
  state.backClicks = backClicks;
  state.tarif = tarif;
  state.advisoryHover = advisoryHover;

  if (reason) {
    state.lastProactiveAt = now;
    state.lastProactiveStep = step;
  }

  return reason;
}

export function resetStepCoachState(state, step) {
  state.stuckTariffFired = false;
  state.step6HesitationFired = false;
  state.advisoryHover = false;
  state.step = step;
}

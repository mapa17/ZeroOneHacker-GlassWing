import { freshForm, validateStep, calcPremium, evaluateOutcome, terminalStatus } from "../logic/form.js";
import { nextStepAfter, backStepFrom, isEarlyOutcomeJump } from "../logic/funnelRouting.js";

/** Headless funnel state machine — mirrors App.jsx next()/back rules. */
export function createFunnelEngine(initialForm = null) {
  let step = 0;
  let form = initialForm ? JSON.parse(JSON.stringify(initialForm)) : freshForm();

  const snapshotForm = () => JSON.parse(JSON.stringify(form));

  const getPremium = () => calcPremium(form.tarif, form.addons);
  const getOutcome = () => evaluateOutcome(form);
  const validateCurrentStep = () => validateStep(step, form);

  /** Advance after current step is valid — same branching as App.jsx next(). */
  function advanceStep() {
    const from = step;
    const to = nextStepAfter(step, form);
    step = to;
    if (isEarlyOutcomeJump(from, to)) {
      return { jumped: true, to };
    }
    if (from === 6) {
      return { to, route: getOutcome().route };
    }
    return { to };
  }

  function goBack() {
    step = backStepFrom(step, form);
  }

  function patchForm(patch) {
    form = { ...form, ...patch };
    if (patch.coverage) form.coverage = { ...form.coverage, ...patch.coverage };
    if (patch.addons) form.addons = { ...form.addons, ...patch.addons };
  }

  return {
    get step() { return step; },
    set step(v) { step = v; },
    get form() { return form; },
    snapshotForm,
    getPremium,
    getOutcome,
    validateCurrentStep,
    advanceStep,
    goBack,
    patchForm,
    get completed() { return step === 8; },
    /** "completed" | "advisor_forward" once the outcome page is reached, else null. */
    get terminalStatus() { return step === 8 ? terminalStatus(form) : null; },
  };
}

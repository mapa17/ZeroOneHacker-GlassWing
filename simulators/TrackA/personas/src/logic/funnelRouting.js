import { evaluateOutcome, filled } from "./form.js";

/** Forward step after validation passes — same rules as App.jsx next(). */
export function nextStepAfter(step, form) {
  if (step === 0) return form.coverage.krankenhaus ? 8 : 1;
  if (step === 1) return form.insuredPerson === "others" ? 8 : 2;
  if (step < 6) return step + 1;
  if (step === 6) return evaluateOutcome(form).route === "beratung" ? 7 : 8;
  if (step === 7) return 8;
  return step;
}

/** Step 8 back-nav: early hospital path (jumped from step 0 without birth date). */
export function hospitalExitFromOutcome(form) {
  return form.coverage.krankenhaus && !filled(form.geburtsdatum);
}

/** Step 8 back-nav: early others path (jumped from step 1 without birth date). */
export function othersExitFromOutcome(form) {
  return form.insuredPerson === "others" && !filled(form.geburtsdatum);
}

/** Back step — same rules as App.jsx back(). */
export function backStepFrom(step, form) {
  if (step === 8) {
    if (hospitalExitFromOutcome(form)) return 0;
    if (othersExitFromOutcome(form)) return 1;
    return evaluateOutcome(form).route === "beratung" ? 7 : 6;
  }
  if (step === 7) return 6;
  if (step > 0) return step - 1;
  return step;
}

/** Whether advance from this step jumps straight to outcome (step 8). */
export function isEarlyOutcomeJump(fromStep, toStep) {
  return (fromStep === 0 || fromStep === 1) && toStep === 8;
}

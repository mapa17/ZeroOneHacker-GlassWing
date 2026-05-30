/** Coach intercept state — injected into step 5+ page context. */

/**
 * @typedef {null | {
 *   type: string,
 *   message: string,
 *   reasons?: string[],
 *   appliedAt: string,
 *   source: "coach"
 * }} CoachIntercept
 */

export function createCoachIntercept({ type, message, reasons }) {
  return {
    type,
    message,
    reasons: reasons || [],
    appliedAt: new Date().toISOString(),
    source: "coach",
  };
}

/** Text block appended to describeStep when a coach intervention is active. */
export function describeCoachForStep(coachState) {
  if (!coachState) return "";
  return [
    "",
    "## [Coach-Hinweis auf dieser Seite]",
    coachState.message,
    "Sie können die markierte Auswahl ändern, um online fortzufahren, oder sie beibehalten "
    + "(dann werden Sie zur Beratung weitergeleitet).",
  ].join("\n");
}

/** Block describing the message_coach action — available on every step when the coach is on. */
export function coachActionBlock() {
  return [
    "",
    "## Coach-Chat",
    "Sie können dem Coach jederzeit eine Nachricht schreiben (z. B. eine Rückfrage). Das ändert",
    "weder das Formular noch den Schritt:",
    `{ "action": "message_coach", "message": "..." }`,
  ].join("\n");
}

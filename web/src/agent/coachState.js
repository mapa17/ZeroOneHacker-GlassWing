/** Coach intercept state — injected into step 5+ page context. */

/**
 * @typedef {null | {
 *   type: string,
 *   message: string,
 *   highlightAddon?: string,
 *   priceReframe?: string,
 *   appliedAt: string,
 *   source: "coach"
 * }} CoachIntercept
 */

export function createCoachIntercept({ type, message, highlightAddon, priceReframe }) {
  return {
    type,
    message,
    highlightAddon: highlightAddon || null,
    priceReframe: priceReframe || null,
    appliedAt: new Date().toISOString(),
    source: "coach",
  };
}

/** Text block appended to describeStep when coach is active. */
export function describeCoachForStep(coachState, step) {
  if (!coachState) return "";

  const lines = [
    "",
    "## [Coach intervention active on this page]",
    `Message shown to you: "${coachState.message}"`,
  ];
  if (coachState.highlightAddon) {
    lines.push(`Highlighted addon on page: ${coachState.highlightAddon}`);
  }
  if (coachState.priceReframe) {
    lines.push(`Price note: ${coachState.priceReframe}`);
  }
  lines.push("You may react to this message — continue, adjust your choices, go back, or leave.");
  return lines.join("\n");
}

export function pageModificationsFromIntercept(intercept) {
  if (!intercept) return null;
  return {
    bannerMessage: intercept.message,
    highlightAddon: intercept.highlightAddon,
    priceReframe: intercept.priceReframe,
    type: intercept.type,
  };
}

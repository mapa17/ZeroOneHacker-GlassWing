/** Classify exit reasons into deferral (pause) vs hard permanent abandon. */

const DEFERRAL_PATTERNS = [
  /think about it/i,
  /compare/i,
  /check (another|other|first|later|the|this|everything|provider|options)/i,
  /come back/i,
  /return later/i,
  /sp[aä]ter/i,
  /zur[uü]ck/i,
  /kurz pr[uü]fen/i,
  /muss.*pr[uü]fen/i,
  /need to (check|verify|look|confirm)/i,
  /don't want to guess/i,
  /do not want to guess/i,
  /nicht.*raten/i,
  /falsch eingeben/i,
  /wrong(ly)?/i,
  /not sure yet/i,
  /look (it|this) up/i,
  /verify/i,
  /nachdenken/i,
  /überlegen/i,
  /weiter ausf[uü]llen/i,
  /not ready/i,
  /later/i,
  /another time/i,
  /another provider/i,
  /anderen anbieter/i,
  /real birth date/i,
  /can't provide/i,
  /cannot provide/i,
  /kann.*nicht.*angeben/i,
];

const HARD_LEAVE_PATTERNS = [
  /distrust/i,
  /misleading/i,
  /deceived/i,
  /t[aä]uscht/i,
  /too expensive/i,
  /zu teuer/i,
  /advisor required/i,
  /beratung.*pflicht/i,
  /forced.*advisor/i,
  /not online/i,
  /nicht online/i,
  /marketing/i,
  /upsell/i,
  /pressure/i,
  /frustrated/i,
  /frustriert/i,
  /unfair/i,
  /breach of trust/i,
  /vertrauen.*verloren/i,
  /won't buy/i,
  /will not buy/i,
  /kauf.*nicht/i,
  /close the tab/i,
  /tab schlie/i,
];

/**
 * @returns {'deferral' | 'hard_leave'}
 */
export function classifyExitReason(reason) {
  const text = String(reason || "").trim();
  if (!text) return "hard_leave";

  for (const pat of HARD_LEAVE_PATTERNS) {
    if (pat.test(text)) return "hard_leave";
  }
  for (const pat of DEFERRAL_PATTERNS) {
    if (pat.test(text)) return "deferral";
  }
  return "hard_leave";
}

export function exitBehaviorRulesBlock() {
  return `
## Exit behavior (important)
- If you only need to verify data or look something up: use \`fill_fields\` with profile values, or \`continue_thinking\` to hesitate on this page.
- If you intend to come back later (not now): use \`{ "action": "pause", "reason": "..." }\` — this is deferral, NOT a permanent drop.
- Use \`{ "action": "leave", "reason": "..." }\` ONLY for genuine permanent abandon: distrust, frustration, wrong channel, advisor pressure, price deception.
- Do NOT use \`leave\` for "I'll check later", "I'll think about it", or "I need to verify" — use \`pause\` or \`continue_thinking\` instead.

Available on any step:
{ "action": "continue_thinking", "note": "optional short thought" }
{ "action": "pause", "reason": "why you defer (e.g. will check birth date and return)" }
{ "action": "leave", "reason": "permanent abandon only" }`;
}

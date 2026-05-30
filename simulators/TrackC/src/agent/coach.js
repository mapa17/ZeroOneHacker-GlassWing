/**
 * Coach entry point. Re-exports the LLM session factory and prompt constants.
 * The old rule-based evaluateCoach() has been replaced by the LLM coach —
 * advisor routing state is now passed as context in the observation, not used
 * as a hard trigger.
 */
export { createCoachSession } from "./coachLLM.js";
export { COACH_SYSTEM_PROMPT, buildObservation, buildUserQuestion } from "./coachPrompt.js";

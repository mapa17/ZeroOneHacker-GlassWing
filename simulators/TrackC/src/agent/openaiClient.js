import { chatCompletion as gptChat, getOpenAIModel, getCoachModel } from "../../scripts/gpt.mjs";

export { getOpenAIModel, getCoachModel };

/** Multi-turn chat completion wrapper — pass model to override the default. */
export async function chatCompletion({ system, messages, temperature = 0.7, model } = {}) {
  const start = Date.now();
  const { text, model: usedModel } = await gptChat({ system, messages, temperature, model });
  return { text, model: usedModel, latencyMs: Date.now() - start };
}

/** Strip HTML comment header from generated system prompt files. */
export function loadSystemPrompt(text) {
  return text.replace(/^<!--[\s\S]*?-->\s*/m, "").trim();
}

import { chatCompletion as gptChat, getOpenAIModel } from "../../scripts/gpt.mjs";

export { getOpenAIModel };

/** Multi-turn chat completion wrapper for interactive agent. */
export async function chatCompletion({ system, messages, temperature = 0.7 }) {
  const start = Date.now();
  const { text, model } = await gptChat({ system, messages, temperature });
  return { text, model, latencyMs: Date.now() - start };
}

/** Strip HTML comment header from generated system prompt files. */
export function loadSystemPrompt(text) {
  return text.replace(/^<!--[\s\S]*?-->\s*/m, "").trim();
}

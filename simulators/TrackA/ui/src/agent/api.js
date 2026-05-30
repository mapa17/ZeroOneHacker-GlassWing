export async function callClaude(system, userText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

export function safeParse(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const s = t.search(/[\[{]/);
  const end = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (s >= 0 && end > s) { try { return JSON.parse(t.slice(s, end + 1)); } catch (e) {} }
  throw new Error("JSON konnte nicht geparst werden");
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

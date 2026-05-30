/**
 * LLM-driven coach session. Maintains its own conversation history, independent
 * of the customer's message array. The caller provides a chatFn to decouple from
 * the API client:
 *   - CLI:  chatFn = chatCompletion from openaiClient.js
 *   - Web:  chatFn = claudeChat from api.js
 *
 * chatFn signature: ({ system, messages }) => Promise<{ text: string }>
 *
 * Every call returns a CoachResponse object containing the full train of thought:
 *   { personaEstimate, personaConfidence, personaReasoning,
 *     customerConcerns, coachReasoning, message }
 */

/** Parse the coach LLM's structured JSON response, with fallback for malformed output. */
function extractResponse(raw) {
  let t = (raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();

  let obj = null;
  try { obj = JSON.parse(t); } catch { /* fall through */ }

  if (!obj) {
    const s = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (s >= 0 && end > s) {
      try { obj = JSON.parse(t.slice(s, end + 1)); } catch { /* fall through */ }
    }
  }

  if (!obj) {
    return {
      personaEstimate: "unclear",
      personaConfidence: "low",
      personaReasoning: "(Antwort konnte nicht geparst werden)",
      customerConcerns: [],
      coachReasoning: "(Antwort konnte nicht geparst werden)",
      message: null,
    };
  }

  return {
    personaEstimate:    obj.persona_estimate    ?? "unclear",
    personaConfidence:  obj.persona_confidence  ?? "low",
    personaReasoning:   obj.persona_reasoning   ?? "",
    customerConcerns:   Array.isArray(obj.customer_concerns) ? obj.customer_concerns : [],
    coachReasoning:     obj.coach_reasoning     ?? "",
    message:            obj.message             ?? null,
  };
}

/**
 * Create a stateful coach session.
 * @param {{ chatFn: Function, systemPrompt: string, enabled?: boolean }} opts
 * @returns {{ observe: Function, reply: Function, getHistory: Function }}
 */
export function createCoachSession({ chatFn, systemPrompt, enabled = true }) {
  const messages = []; // coach's own conversation history

  async function callCoach(userContent) {
    messages.push({ role: "user", content: userContent });
    const { text } = await chatFn({ system: systemPrompt, messages });
    messages.push({ role: "assistant", content: text });
    return extractResponse(text);
  }

  return {
    /**
     * Observe a customer action. Returns a full CoachResponse with persona estimate,
     * concerns, reasoning, and an optional message (null = stay silent).
     * When advisor routing is active the coach must always speak — if the LLM
     * returns null we fall back to a default warning.
     */
    async observe(observationText) {
      if (!enabled) return null;
      try {
        const response = await callCoach(observationText);
        const advisorActive = observationText.includes("⚠ Beratungspfad aktiv");
        if (advisorActive && !response.message) {
          // Extract the reason line from the observation for the fallback message.
          const reasonMatch = observationText.match(/Gründe?: (.+)/);
          const reason = reasonMatch ? reasonMatch[1].trim() : "Ihre aktuelle Auswahl";
          response.message =
            `Hinweis: ${reason} führt dazu, dass kein Online-Abschluss möglich ist. ` +
            "Möchten Sie die Auswahl ändern, um online fortzufahren?";
          response.coachReasoning =
            (response.coachReasoning || "") + " [Pflicht-Fallback: Beratungspfad aktiv]";
        }
        return response;
      } catch (e) {
        console.warn(`[coach] observe error: ${e.message}`);
        return {
          personaEstimate: "unclear", personaConfidence: "low",
          personaReasoning: `[Fehler: ${e.message}]`,
          customerConcerns: [], coachReasoning: `[LLM-Fehler: ${e.message}]`,
          message: null,
        };
      }
    },

    /**
     * Reply to a direct customer/user question. Always returns a CoachResponse
     * with a non-null message.
     */
    async reply(questionText) {
      if (!enabled) return null;
      try {
        const response = await callCoach(questionText);
        if (!response.message) {
          response.message = "Ich bin für Sie da — bitte stellen Sie Ihre Frage.";
        }
        return response;
      } catch (e) {
        console.warn(`[coach] reply error: ${e.message}`);
        return {
          personaEstimate: "unclear",
          personaConfidence: "low",
          personaReasoning: "",
          customerConcerns: [],
          coachReasoning: "",
          message: "Entschuldigung, ich konnte Ihre Anfrage gerade nicht bearbeiten.",
        };
      }
    },

    /** Full coach conversation history for session logging. */
    getHistory() {
      return messages.slice();
    },
  };
}

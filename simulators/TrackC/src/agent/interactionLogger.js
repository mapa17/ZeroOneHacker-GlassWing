/** Append-only interaction trace logger for interactive agent sessions. */

function preview(text, max = 120) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export function createInteractionLogger(meta) {
  const session = {
    sessionId: meta.sessionId,
    profileFile: meta.profileFile,
    systemPromptFile: meta.systemPromptFile,
    model: meta.model,
    systemPromptText: meta.systemPromptText || null,
    focusedMode: !!meta.focusedMode,
    coachEnabled: !!meta.coachEnabled,
    startedAt: new Date().toISOString(),
    turns: [],
    coachEvents: [],
    outcome: null,
  };

  function ensureTurn(turnIndex) {
    while (session.turns.length <= turnIndex) {
      session.turns.push({
        turnIndex: session.turns.length,
        timestamp: new Date().toISOString(),
        funnelStep: null,
        pageName: null,
        input: null,
        output: null,
        effect: null,
        latencyMs: null,
      });
    }
    return session.turns[turnIndex];
  }

  return {
    logTurnInput(turnIndex, { funnelStep, pageName, userMessage, conversationTurnCount, priorMessagesSummary, pageView, modelView }) {
      const t = ensureTurn(turnIndex);
      t.funnelStep = funnelStep;
      t.pageName = pageName;
      t.timestamp = new Date().toISOString();
      t.input = {
        systemPromptChars: session.systemPromptText?.length ?? 0,
        conversationTurnCount,
        userMessage,
        priorMessagesSummary: priorMessagesSummary || [],
        pageView: pageView || null,
        modelView: modelView || null,
      };
    },

    logTurnOutput(turnIndex, { rawAssistantText, parsedAction, parseError, retryCount, latencyMs, apiAttempts }) {
      const t = ensureTurn(turnIndex);
      t.output = {
        rawAssistantText,
        parsedAction,
        parseError: parseError || null,
        retryCount: retryCount ?? 0,
        apiAttempts: apiAttempts || null,
      };
      if (latencyMs != null) t.latencyMs = latencyMs;
    },

    logStateEffect(turnIndex, effect) {
      const t = ensureTurn(turnIndex);
      t.effect = effect;
    },

    logCoachEvent(event) {
      session.coachEvents.push({
        eventIndex: session.coachEvents.length,
        timestamp: new Date().toISOString(),
        ...event,
      });
    },

    logCoachOnTurn(turnIndex, { coachResponse, coachIntercept }) {
      const t = ensureTurn(turnIndex);
      if (t.output) {
        t.output.coachResponse = coachResponse ?? null;
        t.output.coachIntercept = coachIntercept ?? null;
      }
    },

    setOutcome(outcome) {
      session.outcome = outcome;
    },

    getTurns() {
      return session.turns.filter((t) => t.input != null);
    },

    toJSON() {
      return JSON.parse(JSON.stringify(session));
    },

    toMarkdownTrace() {
      const lines = [
        `# Interaction trace — ${session.sessionId}`,
        "",
        `- Profile: \`${session.profileFile}\``,
        `- System prompt: \`${session.systemPromptFile}\``,
        `- Model: ${session.model}`,
        `- Started: ${session.startedAt}`,
        session.focusedMode ? `- Focused mode: online-only choices on steps 0–6` : null,
        session.coachEnabled ? `- Coach: advisor-warning enabled` : null,
        "",
      ];

      for (const turn of session.turns.filter((t) => t.input)) {
        lines.push(`## Turn ${turn.turnIndex} — Step ${turn.funnelStep}: ${turn.pageName || "?"}`);
        lines.push("");

        if (turn.input.pageView) {
          lines.push("### Page state (what this step was built from)");
          lines.push("```json");
          lines.push(JSON.stringify(turn.input.pageView, null, 2));
          lines.push("```");
          lines.push("");
          if (turn.input.pageView.validationErrors && Object.keys(turn.input.pageView.validationErrors).length) {
            lines.push("### Validation errors shown to model");
            lines.push("```");
            for (const [field, msg] of Object.entries(turn.input.pageView.validationErrors)) {
              lines.push(`${field}: ${msg}`);
            }
            lines.push("```");
            lines.push("");
          }
        }

        if (turn.input.modelView) {
          lines.push("### Model context (exact API input)");
          lines.push("");
          lines.push("**System prompt**");
          lines.push("```");
          lines.push(turn.input.modelView.systemPrompt || "(see session.systemPromptText)");
          lines.push("```");
          lines.push("");
          lines.push("**Messages sent to the model**");
          for (const msg of turn.input.modelView.messages || []) {
            lines.push("");
            lines.push(`#### ${msg.role}`);
            lines.push("```");
            lines.push(msg.content || "");
            lines.push("```");
          }
          lines.push("");
        }

        lines.push("### Current step prompt (userMessage)");
        lines.push("```");
        lines.push(turn.input.userMessage);
        lines.push("```");
        lines.push("");
        lines.push("### LLM response");
        lines.push("```");
        lines.push(turn.output?.rawAssistantText || "(no response)");
        lines.push("```");
        if (turn.output?.apiAttempts?.length > 1) {
          lines.push("");
          lines.push("### API attempts (including retries)");
          for (const attempt of turn.output.apiAttempts) {
            lines.push(`- Attempt ${attempt.attempt}: ${attempt.parseError ? `parse error — ${attempt.parseError}` : "ok"}`);
            if (attempt.extraUserMessage) {
              lines.push("");
              lines.push("Retry user message:");
              lines.push("```");
              lines.push(attempt.extraUserMessage);
              lines.push("```");
            }
          }
        }
        if (turn.output?.parsedAction) {
          lines.push("");
          const { begruendung, ...actionWithout } = turn.output.parsedAction;
          lines.push(`Parsed action: \`${JSON.stringify(actionWithout)}\`${turn.output.retryCount ? ` (retries: ${turn.output.retryCount})` : ""}`);
          if (begruendung) {
            lines.push("");
            lines.push("### Begründung");
            lines.push(begruendung);
          }
        }
        if (turn.output?.parseError) {
          lines.push(`Parse error: ${turn.output.parseError}`);
        }
        if (turn.latencyMs != null) lines.push(`Latency: ${turn.latencyMs}ms`);
        lines.push("");
        if (turn.effect) {
          lines.push("### Effect");
          if (turn.effect.abandoned) {
            lines.push(`- **Abandoned (hard leave)** at step ${turn.effect.stepBefore}: ${turn.effect.leaveReason || ""}`);
          } else if (turn.effect.paused) {
            const tag = turn.effect.reclassifiedFromLeave ? " (reclassified from leave)" : "";
            lines.push(`- **Paused (deferral)** at step ${turn.effect.stepBefore}${tag}: ${turn.effect.pauseReason || ""}`);
          } else if (turn.effect.dwelling) {
            lines.push(`- **Continue thinking** at step ${turn.effect.stepBefore}${turn.effect.dwellNote ? `: ${turn.effect.dwellNote}` : ""}`);
          } else {
            lines.push(`- Step ${turn.effect.stepBefore} → ${turn.effect.stepAfter}`);
            if (turn.effect.validationErrors && Object.keys(turn.effect.validationErrors).length) {
              lines.push(`- Validation errors: ${JSON.stringify(turn.effect.validationErrors)}`);
            }
          }
          lines.push("");
        }
      }

      for (const ev of session.coachEvents) {
        lines.push(`## Coach event ${ev.eventIndex} (step ${ev.triggerStep})`);
        lines.push("");
        const r = ev.output?.coachResponse;
        if (r) {
          lines.push(`**Persona-Einschätzung:** ${r.personaEstimate} (${r.personaConfidence})`);
          if (r.personaReasoning) lines.push(`*${r.personaReasoning}*`);
          lines.push("");
          if (r.customerConcerns?.length) {
            lines.push("**Vermutete Kundenbedenken:**");
            r.customerConcerns.forEach((c) => lines.push(`- ${c}`));
            lines.push("");
          }
          if (r.coachReasoning) {
            lines.push("**Coach-Überlegung:**");
            lines.push(r.coachReasoning);
            lines.push("");
          }
          if (r.message) {
            lines.push("**Nachricht an den Kunden:**");
            lines.push(`> ${r.message}`);
          } else {
            lines.push("**Nachricht:** (Coach schweigt)");
          }
        } else if (ev.output?.coachIntercept) {
          lines.push(`**Nachricht:** ${ev.output.coachIntercept.message}`);
        } else {
          lines.push("(keine Coach-Antwort)");
        }
        lines.push("");
      }

      if (session.outcome) {
        lines.push("## Outcome");
        lines.push(`- Completed: ${session.outcome.completed}`);
        if (session.outcome.advisorForward) {
          lines.push(`- Advisor forward: true${session.outcome.advisorReasons?.length ? ` (${session.outcome.advisorReasons.join("; ")})` : ""}`);
        }
        lines.push(`- Final step: ${session.outcome.finalStep}`);
        if (session.outcome.abandoned) {
          lines.push(`- Hard drop step: ${session.outcome.dropStep}`);
          if (session.outcome.leaveReason) lines.push(`- Leave reason: ${session.outcome.leaveReason}`);
        }
        if (session.outcome.paused) {
          lines.push(`- Paused at step: ${session.outcome.pauseStep}`);
          if (session.outcome.pauseReason) lines.push(`- Pause reason: ${session.outcome.pauseReason}`);
        }
        if (session.outcome.dwellTurnCount) lines.push(`- Dwell turns (continue_thinking): ${session.outcome.dwellTurnCount}`);
      }

      return lines.join("\n");
    },

    formatTurnSummary(turnIndex) {
      const t = session.turns[turnIndex];
      if (!t?.output) return "";
      const action = t.output.parsedAction?.action || t.output.parseError || "?";
      const detail =
        t.output.parsedAction?.tarif
        || t.output.parsedAction?.reason
        || t.output.parsedAction?.note
        || "";
      const ms = t.latencyMs != null ? ` (${t.latencyMs}ms)` : "";
      const ok = t.output.parseError ? "✖" : "✓";
      const reasoning = t.output.parsedAction?.begruendung;
      const reasoningSnippet = reasoning ? ` — "${preview(reasoning, 60)}"` : "";
      return `[turn ${turnIndex}] step=${t.funnelStep} ${t.pageName} → ${action}${detail ? `:${detail}` : ""}${ms} ${ok}${reasoningSnippet}`;
    },

    formatCoachSummary(ev) {
      const type = ev.output?.coachIntercept?.type || "none";
      return `[coach] step=${ev.triggerStep} ${type}`;
    },
  };
}

export function summarizeMessages(messages) {
  return (messages || []).map((m) => ({
    role: m.role,
    chars: (m.content || "").length,
    preview: preview(m.content),
  }));
}

/** Snapshot of the exact OpenAI chat payload for a turn. */
export function buildModelView(systemPrompt, messages) {
  return {
    systemPrompt: systemPrompt || null,
    messages: (messages || []).map((m) => ({
      role: m.role,
      content: m.content || "",
    })),
  };
}
